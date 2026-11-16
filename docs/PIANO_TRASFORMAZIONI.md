# Piano: Forma Selvatica e incantesimi di trasformazione

16 novembre 2026. Solo piano: nessun codice è cambiato e il documento non è
committato.

**Stato:** il 16/11 l'utente ha approvato tutte le decisioni G24–G41 come
raccomandate («Approvo tutto»), con un'aggiunta a G37: oltre alle 8 forme
rapide serve un comando per importare altre forme. Il comando, «Altra
forma…», è in W2a. Ogni lotto parte comunque con il via dell'utente.

- **W1 fatto il 16/11**, non committato: le funzioni pure delle forme in
  `src/transformationCore.js`, con 17 test. Il §4 dice cosa è cambiato.
- **W2a fatto il 16/11**, non committato: la forma sulla pill dalla console, le
  forme rapide sulla scheda e «Altra forma…». Il §4 dice cosa è cambiato; la
  prova in stanza è la voce B30 di `PROVE_IN_STANZA.md`.
- **W3 fatto il 16/11**, non committato: gli attacchi della forma nella console,
  armi e incantesimi della scheda messi da parte, CA, TS, immunità e difese della
  forma. Il «Multiattacco» e la CA nella scheda della card sono arrivati il 16/11
  sera («I punti rimasti»). Prova in stanza: voce B34.
- **W4 fatto il 16/11**, non committato: la velocità della forma sostituisce
  quella del druido, e la taglia del token segue la forma e torna (G36). Prova in
  stanza: voce B35.
- **W5 fatto il 16/11**, W5a–W5e insieme, non committato: il druido prende i PF
  della forma, a 0 torna ai suoi con l'eccesso, alla fine li riprende interi; la
  memoria, il riposo e gli altri scrittori di PF lo sanno. Il §4 dice cosa è
  cambiato; prova in stanza: voce B37.
- **W6 fatto il 16/11**, non committato: la Forma Selvatica è un'azione bonus per
  il Circolo della Luna, la cura con lo slot in forma, la durata in ore. Prova in
  stanza: voce B40.
- **W7a–W7d fatti il 16/11**, non committati: Trasformazione, Metamorfosi,
  Metamorfosi Pura e Forme Animali dal pannello degli incantesimi, con la forma
  per bersaglio. «Rendi permanente» (G30) è scartato: l'ha deciso l'utente il
  16/11, la Metamorfosi Pura permanente resta al tavolo. Prova in stanza: voce
  B41.
- **W7e fatto il 16/11**, non committato: Metamorfosi di Massa con i PF
  temporanei della forma, che altre fonti non sostituiscono, e l'Impulso 77–78 con
  la pecora. Prova in stanza: voce B43.

**Da dove parte:** `docs/STUDIO_GIOCO_ONLINE.md`, §3, con le decisioni G15–G18
già approvate dall'utente. Le si riprendono qui e non si rifanno. Le decisioni
nuove partono da G24, perché G19–G23 sono quelle di SB3.

**Cosa aggiunge allo studio:**
- la primitiva di trasformazione diventa una sola, per il druido e per i
  quattro incantesimi: Metamorfosi, Metamorfosi Pura, Trasformazione, Forme
  Animali;
- i lotti W1–W7 sono scomposti in passi piccoli, e gli incantesimi entrano
  dove servono;
- il piano esatto della strada (a) per i PF della forma, percorso per
  percorso, con le righe ricontrollate nel codice;
- i rischi secondo AGENTS.md e le decisioni aperte.

Legenda: **[V]** letto nel codice, **[P]** provato, **[D]** dedotto, da
confermare all'inizio del lotto. Codice letto su `main` (`9ba15942`), con le
modifiche non committate delle altre sessioni nella cartella: i numeri di riga
possono spostarsi.

## Riepilogo

| Lotto | Cosa fa | Tocca i PF | Rischio |
| --- | --- | --- | --- |
| W1 | Le forme: istantanea di uno statblock e limiti di ogni fonte (funzioni pure) | No | Basso |
| W2 | La forma sulla pill: Forma Selvatica dalla console, incantesimi dal pannello | No | Basso |
| W3 | La console usa la forma: azioni, multiattacco, CA, TS, difese, incantesimi nascosti | No | Medio (console in lavorazione) |
| W4 | Velocità e taglia della forma | No | Medio (Movimento, taglia fuori Cronologia) |
| W5 | PF della forma, strada (a), in cinque passi | **Sì** | **Alto** |
| W6 | Circolo della Luna: azione bonus, cura con lo slot, Forma Elementale, durata | Sì (la cura) | Medio |
| W7 | Gli incantesimi: Trasformazione, Metamorfosi, Metamorfosi Pura, Forme Animali | Riusa W5 | Medio |

W1–W4 non scrivono PF, turno né ordine: si possono fare e provare in stanza
prima di W5 (G15). W5 non parte senza il via dell'utente su questo piano.

## 1. Cosa è già deciso (G15–G18)

- **G15:** prima W1–W4, senza PF; poi W5 con un piano a parte (questo).
- **G16:** strada (a). I PF del druido vanno messi da parte sulla pill, e
  `meta.hp` e `meta.hpMax` diventano quelli della forma. A 0 PF della forma
  il druido torna con l'eccesso. La strada (c), i PF temporanei, resta solo
  un ripiego.
- **G17:** le bestie vengono dall'archivio 5eTools del GM e da un JSON o un
  testo incollato. Un elenco SRD dentro il plugin si fa solo se il druido del
  gruppo non usa l'archivio.
- **G18:**
  - i PF temporanei restano;
  - Aiuto durante la forma resta sul druido;
  - niente sciami;
  - i PF della forma sono la media dello statblock, modificabile;
  - online il giocatore vede i PF della forma;
  - l'editor in linea non calcola l'eccesso;
  - su una mappa nuova la forma non segue.

## 2. Com'è oggi (ricontrollato)

- **Forma Selvatica** ([class-features-runtime.json:15678](../src/class-features-runtime.json))
  **[V]**:
  - pill 🐺 senza `mechanics`, che spende un uso di `druido-forma-selvatica-usi`;
  - il testo della pill dice che il plugin non sostituisce i PF;
  - lo fissa `test/druidFeatureRuntime.test.js:86-94`.
- **Circolo della Luna** **[V]**:
  - Forma Selvatica da Combattimento (15746), Forme del Circolo (15889), Colpo
    Primordiale (16874) e Mille Forme (17717) sono `not-automated`;
  - Forma Selvatica Elementale (17332) è la stessa pill a due usi;
  - Incantesimi Bestiali (17969) e Arcidruido (18017) esistono come voci.
- **I quattro incantesimi** **[V]**: in `data/spell-implementation-status.json`
  sono `PARTIAL`, `RED`, con la capacità mancante `FORM-STATE`. Nel codice c'è
  solo:
  - il TS su Saggezza di Metamorfosi e Metamorfosi Pura
    (`src/spellCastResolutionRules.js:769`);
  - il TS chiesto solo al bersaglio non consenziente (`:790`);
  - il limite di bersagli di Forme Animali (`src/spells-srd.js:767`).
- **Altre due fonti trovate** **[V]**:
  - *Metamorfosi di Massa* (Xanathar, `xanathar-metamorfosi-di-massa`): nel
    catalogo, senza testo nel repository;
  - l'*Impulso di Magia Selvaggia* 77–78 lancia Metamorfosi su di sé
    (`class-features-runtime.json:42506`, `spellId: "polymorph"`).
- **I precedenti che si riusano** **[V]**:
  - azioni concesse: `spellGrantedActionsForItem`
    (`src/spellGrantedActionsCore.js:73`). Oggi legge solo i record degli
    incantesimi (`SPELLS_KEY`), non le pill;
  - difese da una pill: `effectDamageDefensesForItem`
    (`src/damageDefensesCore.js:197`) legge già `mechanics.damageDefenses` di
    ogni pill attiva;
  - velocità: `baseModeSources` (`src/movementProfileCore.js:186`) tiene la
    velocità più alta tra quella base e `grantMeters`. `setMeters` (`:317`)
    prende il minimo ed è trattato come una riduzione. Nessuno dei due
    sostituisce il passo con uno più basso;
  - taglia: `setTokenCells` e `tokenCentreSnap` (`src/tokenSizeCore.js`), usati
    da `applyMonsterTokenSize` (`src/monsterTokenSize.js:14`), fuori dalla
    Cronologia;
  - PF che cambiano con una pill: CAP-TEMP T3a (scadenza dei temporanei) e
    CAP-MAXHP X1 (`planCommandMaxHpWrites`, `src/effectsMutations.js:1189`).

## 3. La primitiva di trasformazione

### Il modello

**Una pill con `mechanics.transformation`**, la stessa per ogni fonte. La pill
può essere di una capacità di classe (Forma Selvatica) o di un incantesimo
(Metamorfosi e gli altri). Campi:

| Campo | Cosa tiene | Chi lo scrive |
| --- | --- | --- |
| `kind` | `wild-shape`, `elemental-wild-shape`, `polymorph`, `true-polymorph`, `shapechange`, `animal-shapes` | la fonte |
| `form` | l'istantanea della forma (sotto) | chi la sceglie (W2) |
| `keepsMind` | se Int, Sag e Car restano quelle della creatura | la fonte (tabella) |
| `keepsFeatures` | se capacità di classe, specie e competenze restano | la fonte |
| `canCast` | se può lanciare incantesimi nella forma | la fonte e il livello (Incantesimi Bestiali) |
| `formHp` | i PF della forma all'inizio: la media, modificabile (G18) | chi la sceglie |
| `stash` | `{ hp, hpMax }` della forma normale, messi da parte | **il coordinatore**, nel comando che mette la pill (W5) |
| `tokenBefore` | scala e posizione del token prima della forma | W4 |

**L'istantanea della forma** (`form`), presa da uno statblock con le stesse
funzioni di oggi:
- nome, fonte e `ref`;
- tipo e GS;
- taglia;
- PF medi e formula;
- CA;
- For, Des e Cos, e i loro TS. Int, Sag e Car servono solo quando
  `keepsMind` è falso;
- velocità per modo;
- difese, immunità alle condizioni e sensi;
- multiattacco e azioni, nella forma delle azioni rapide;
- tratti, come testo.

Non è uno statblock completo: tiene solo ciò che leggono console, Movimento e
difese, per non gonfiare i metadata del token (vedi i rischi).

**Un modulo nuovo, `src/transformationCore.js`**, con funzioni pure:
- `transformationFormFromStatblock`;
- `transformationFormAllowed`;
- `transformationPill`;
- `transformedCardView`;
- i tre piani dei PF: `planTransformationStart`, `planTransformationRevert`,
  `planTransformationEnd`.

Il coordinatore, il pannello delle aree, il riposo e la memoria chiamano queste
funzioni: nessuno di loro sa da quale fonte viene la forma.

### Le differenze tra le fonti (PHB 2014)

Testi: PHB 2014 pp. 66–69 per il druido; per gli incantesimi
`src/spell-reference-it.json`.

| | Forma Selvatica | Circolo della Luna | Metamorfosi (4°) | Metamorfosi Pura (9°) | Trasformazione (9°) | Forme Animali (8°) |
| --- | --- | --- | --- | --- | --- | --- |
| **Chi** | Sé | Sé | Una creatura entro 18 m | Una creatura (o un oggetto) entro 9 m | Sé | Qualsiasi numero di creature consenzienti entro 9 m |
| **TS** | — | — | Sag, solo chi non è consenziente; niente effetto su un mutaforma o a 0 PF | Come Metamorfosi | — | — (solo consenzienti) |
| **Forma** | Bestia | Bestia; dal 10° anche un elementale | Bestia | Qualsiasi tipo; anche oggetto (fuori dal piano) | Qualsiasi creatura vista, non costrutto né non morto, senza livelli di classe né Incantesimi | Bestia di taglia Grande o inferiore |
| **Limite di GS** | 1/4 al 2°, 1/2 al 4°, 1 all'8° | 1 al 2°, livello/3 dal 6° | GS del bersaglio, o il suo livello | GS del bersaglio, o il suo livello | Il proprio GS, o il livello | 4 |
| **Volo e nuoto** | Niente nuoto né volo al 2°, niente volo al 4° | Come il druido | Nessun limite | Nessun limite | Nessun limite | Nessun limite |
| **Durata** | Metà del livello da druido, in ore | Come il druido | Conc., fino a 1 ora | Conc., fino a 1 ora; permanente se la concentrazione dura tutta l'ora | Conc., fino a 1 ora | Conc., fino a 24 ore |
| **Concentrazione** | Nessuna; quella in corso resta | Come il druido | Di chi lancia | Di chi lancia | Propria | Di chi lancia |
| **Mente** (Int, Sag, Car) | Restano del druido | Restano | **Sostituite** | **Sostituite** | Restano | Restano |
| **Competenze e capacità** | Restano, più quelle della bestia; il bonus più alto vince | Restano | Perse | Perse | Restano; il bonus più alto vince; niente azioni leggendarie né di tana | Non dette **[D]** |
| **Incantesimi** | No, fino a Incantesimi Bestiali (18°) | Come il druido | No | No, salvo che la forma possa | Non vietati: servono voce e mani della forma **[D]** | No |
| **Sensi speciali** | Solo quelli della forma | Come il druido | Della forma | Della forma | Solo quelli della forma | Della forma |
| **Equipaggiamento** | Cade, si fonde o resta, a scelta | Come il druido | Si fonde | Si fonde | Cade, si fonde o resta | Si fonde |
| **Attivazione** | Azione, un uso | **Azione bonus** | Azione (lancio) | Azione (lancio) | Azione (lancio) | Azione (lancio) |
| **Cambiare forma** | Un nuovo uso **[D]** | Come il druido | No | No | Un'azione; i PF non salgono sopra quelli attuali | Azione di chi lancia, per ogni bersaglio |
| **Fine anticipata** | Azione bonus; privo di sensi; 0 PF; morte | Come il druido | 0 PF; morte; fine dell'incantesimo | Come Metamorfosi; dissolta, se permanente | 0 PF; morte; fine dell'incantesimo | 0 PF; morte; fine dell'incantesimo |
| **A 0 PF della forma** | Torna normale; l'eccesso passa ai suoi PF | Come il druido | Come il druido; non cade privo di sensi finché l'eccesso non lo porta a 0 | Come Metamorfosi | Come Metamorfosi; assume anche i Dadi Vita | Come Metamorfosi |
| **Extra** | Al 20° usi illimitati | Cura 1d8 per livello di slot (azione bonus, in forma); Colpo Primordiale al 6° (attacchi magici); Forma Elementale al 10° (due usi); Mille Forme al 14° | — | Oggetto in creatura e creatura in oggetto: fuori dal piano (G31) | Mantiene i privilegi di classe e specie | — |

**Le due fonti in più** (G32):
- **Metamorfosi di Massa** (Xanathar, 9°) **[D]**: dal testo inglese, la
  creatura tiene i suoi PF e riceve PF temporanei pari a quelli della forma,
  non sostituibili da altre fonti; la forma finisce quando non ne restano. È
  la strada (c), già pronta in CAP-TEMP (`tempHpSource` e
  `endsWhenTempHpGone`). Il testo va verificato sul manuale: nel repository
  manca.
- **Impulso 77–78:** lancia Metamorfosi su di sé; se il TS fallisce, la
  creatura diventa una pecora. Dopo W7 l'impulso può aprire il lancio con la
  pecora già proposta.

### Le regole comuni a tutte le fonti

- **PF:** quelli della forma; alla fine tornano quelli di prima; a 0 PF della
  forma il ritorno porta l'eccesso (W5).
- **PF temporanei:** restano dove sono e prendono il danno per primi (G18).
- **Effetti sul massimo** (Aiuto, Ferire): restano sulla forma normale, cioè
  sullo `stash`, non sui PF della forma (G18 per Aiuto; G33 per gli altri).
- **Pill, condizioni ed effetti in corso:** restano. Le condizioni della
  creatura non cambiano con la forma.
- **Identità e immagine del token:** non cambiano. `hpMemory` riconosce i PG
  senza identità da nome e immagine.
- **Esclusi:**
  - creature con PF condivisi e token di incantesimo: le esclusioni di
    `maxHpWritable` (`effectsMutations.js:1133`);
  - creature con una modalità boss (`initiativeCard.bossActionBinding`)
    **[D]**: Paragon ed Epic hanno id virtuali nell'ordine, e la loro forma
    non ha senso.

  Per loro la pill arriva come etichetta, con il motivo nel dettaglio, come
  fa M9 di CAP-MAXHP con `withMaxHpTargetsChecked` (`:1141`) (G25).

## 4. I lotti

Ogni lotto ha la sua voce in `docs/PROVE_IN_STANZA.md`, aggiunta al commit del
lotto. Le prove al banco usano il pannello vero (banco 5204 da una copia pulita,
come per SB3), in vista compatta e in vista espansa.

### W1 · Le forme (funzioni pure)

**Cosa fa:** costruisce l'istantanea di una forma e dice se una forma è ammessa
per una fonte. Non ha interfaccia e non scrive niente.

**File e funzioni:**
- `src/transformationCore.js`, nuovo:
  - `transformationFormFromStatblock(block, record)`: l'istantanea. Tipo e GS
    vengono dal record 5eTools, perché `fiveToolsMonsterToStatblock` non li
    mette nel blocco; dal testo incollato li dà il parser ST1
    (`src/monsterStatblockTextParseCore.js`);
  - `transformationFormAllowed(form, { kind, druidLevel, circle, targetCr, targetLevel, casterLevel })`:
    la tabella del §3, solo regole 2014;
  - `transformationFormCandidates(monsters, rules)`: filtro per tipo, GS, nuoto,
    volo e taglia. Toglie gli sciami (G18) e gli statblock 2024.
- `src/fiveToolsArchiveCore.js`: un filtro per bestia e GS accanto a
  `fiveToolsSearch`, che oggi guarda solo nome e manuale.

**Test:** `test/transformationCore.test.js`, nuovo, con
`test-support/fivetools-srd-monsters.json`:
- lupo, orso bruno, aquila gigante, squalo cacciatore, elementale della terra;
- i limiti al 2°, 4°, 8° livello e per il Circolo della Luna al 2°, 6° e 10°;
- Metamorfosi su un PG di 5° livello e su un ogre (GS 2);
- Trasformazione che rifiuta un non morto;
- Forme Animali che rifiuta una bestia Enorme.

**Banco:** nessuno, è codice puro.
**Stanza:** nessuna.

**Fatto il 16/11** (non committato): `src/transformationCore.js` e
`test/transformationCore.test.js`, 17 test.
- **Funzioni esportate:**
  - `TRANSFORMATION_KINDS`;
  - `challengeRatingValue` e `challengeRatingLabel`: «1/4», `{ cr, lair }`,
    numeri;
  - `creatureTypeOf`: tipo di 5eTools, testo del parser, sciami, nomi
    italiani;
  - `transformationFormFacts`: ciò che leggono i limiti, preso da un record
    senza costruire lo statblock, così si può filtrare un archivio intero;
  - `transformationFormFromStatblock`: l'istantanea;
  - `transformationLimits` e `transformationFormAllowed`: i limiti del §3,
    con tutti i motivi in italiano, non solo il primo;
  - `transformationFormCandidates`: le forme ammesse tra i mostri di un
    archivio.
- **Due scarti dal piano:**
  - `src/fiveToolsArchiveCore.js` non cambia. Il filtro sta in
    `transformationFormCandidates`, che usa `fiveToolsSearch` per il nome e
    legge i mostri derivati con la loro base (`resolveFiveToolsMonster`);
  - `test-support/fivetools-srd-monsters.json` ha 7 mostri senza tipo né GS.
    I test scrivono i loro record, con i dati dell'SRD 5.1.
- **Regole messe nel codice:**
  - gli sciami sono esclusi per tutte le fonti, non solo per il druido;
  - gli statblock 2024 non danno una forma e non entrano nell'elenco;
  - il Circolo della Luna ignora la colonna del GS, ma non i limiti di nuoto e
    volo, come dice il PHB 2014 a p. 69;
  - le quattro forme della Forma Elementale si riconoscono dal nome, inglese
    o italiano: un altro elementale (la salamandra) è rifiutato.

### W2 · La forma sulla pill

**W2a · Forma Selvatica dalla console.**
- **Dati:** `druido-forma-selvatica` e `druido-circolo-della-luna-forma-selvatica-elementale`
  ricevono `effectPlan.mechanics.transformation` con `kind`, `keepsMind: true`,
  `keepsFeatures: true` e `canCast: false`. Fino a W5 il testo della pill dice
  che i PF della forma si gestiscono a mano.
- **Console:**
  - `src/pcAttackFeatureFormCore.js` (`pcAttackFeatureForm`,
    `pcAttackFeatureRequest`): un campo nuovo, «Forma», con le forme
    ammesse;
  - la ricerca nell'archivio, nel browser del GM;
  - un'area per incollare JSON o testo.
- **Attivazione:** `src/classFeatureRuntime.js`, attivazione della capacità:
  copia la forma scelta in `mechanics.transformation.form`, attraverso
  `classFeatureEffectProjection` (`src/classFeatureCore.js:726`). Quella
  funzione oggi copia solo le `mechanics` del piano: la forma scelta va passata
  come valore dell'attivazione, come le varianti.
- **Forme rapide sulla scheda** (G37): fino a 8 istantanee sulla scheda del
  druido. Le riempie il GM, e online il giocatore sceglie da lì: l'archivio
  sta solo nell'IndexedDB del GM. Campo nuovo in `src/initiativeCards.js`,
  normalizzato come gli altri, con il massimo di 8.
- **«Altra forma…»** (aggiunta dell'utente a G37): un comando per importare
  una forma che non è tra le rapide.
  - **Dove:**
    - nel campo «Forma» della console, accanto alle forme rapide;
    - lo stesso comando nella scheda del druido, per riempire le rapide;
    - vale anche quando si cambia forma (G28).
  - **Fonti nel browser del GM:**
    - l'archivio 5eTools, con la ricerca e il filtro di W1;
    - un JSON di 5eTools incollato;
    - un testo incollato, letto dal parser di ST1–ST3;
    - il token di una bestia già nella stanza, con la sua scheda. La scheda
      del mostro non tiene tipo né GS (`sanitizeMonsterProfile`,
      `src/monsterProfileCore.js:61`) **[V]**: li dà il suo `ref` se il
      mostro è nell'archivio, altrimenti li chiede l'anteprima.
  - **Fonti nel browser del giocatore, online:** JSON e testo incollati.
    - L'archivio sta nel browser del GM. Una forma dall'archivio la importa il
      GM dalla console del druido, che può aprire, e può salvarla tra le
      rapide.
    - Una richiesta del giocatore all'archivio del GM (con un broadcast) non è
      prevista: costa un canale nuovo, e il GM fa la stessa cosa dalla
      console.
  - **Prima di usarla:**
    - un'anteprima con nome, tipo, GS, taglia, PF medi, CA e velocità;
    - il controllo dei limiti con `transformationFormAllowed`. Una forma non
      ammessa si vede con il motivo («GS 1: oltre il limite di GS 1/2 al 4°
      livello») e non si può usare;
    - se il testo non dice il tipo o il GS, l'anteprima li chiede in due
      campi prima di controllare i limiti.
  - **Due pulsanti:**
    - «Usa»: la forma vive solo nella pill. Non pesa sulla scheda e sparisce
      alla fine della forma;
    - «Usa e salva»: la forma entra anche tra le rapide. Se le rapide sono già
      8, si sceglie quale sostituire.
  - **Funzioni:**
    - una funzione pura nuova, `transformationFormFromImport`, in
      `transformationCore.js`;
    - per il testo usa `statblockTextImport`
      (`src/monsterStatblockTextImportCore.js:23`), che dà anche tipo e GS
      del parser;
    - per il JSON usa `fiveToolsCollection` e `fiveToolsMonsterToStatblock`
      (`src/fiveToolsMonsterCore.js:877`, `:787`), con gli statblock 2024
      esclusi come nella scheda;
    - per l'archivio usa `createFiveToolsArchiveStore`
      (`src/fiveToolsArchiveStore.js:45`), `fiveToolsSearch`
      (`fiveToolsMonsterCore.js:893`) e il filtro di W1.
  - **Il precedente** è il pannello Importa della scheda, che legge già JSON
    e testo (`readSheetImport`, `src/initiative-card-modal.js:4041`). Il
    comando nuovo non lo tocca: ne riusa le funzioni pure.

**W2a fatto il 16/11** (non committato).
- **File:**
  - `data/class-features/runtime-feature-overrides.json` e il catalogo rigenerato (`src/class-features-runtime.json`, solo le due voci);
  - `src/transformationFormsCore.js`, nuovo: la metà leggera delle forme, senza 5eTools, per la scheda e il runtime.
    `src/transformationCore.js` la riesporta e aggiunge `transformationFormFromImport` e
    `transformationFormFromFiveTools`;
  - `src/initiativeCards.js`: il campo `transformationForms` (pulizia, fusione, campi conosciuti);
  - `src/classFeatureRuntime.js`: `prepareTransformationFeatureActivation`, il parametro `transformationForm` e il
    ramo con `featureOverride`;
  - `src/pcAttackFeatureFormCore.js`: il campo `transformation-form` e la forma obbligatoria nella chiamata;
  - `src/pcAttackTransformationField.js`, nuovo: il campo nella console. In `src/pc-attack.js` ci sono solo l'import e
    l'aggancio in `featureFields`;
  - `public/console-panel.css`: tre regole.
- **Scarti dal piano:**
  - la forma è obbligatoria solo dalla console. Dalla scheda personaggio la Forma Selvatica si attiva come prima,
    senza forma, e la pill dice che la forma si sceglie nella console;
  - le forme rapide hanno anche un tetto di 6000 byte, oltre al massimo di 8. Il registro delle schede sta nei
    metadata della stanza, 16 kB in tutto, e oltre il budget toglie delle schede. Misurato: 8 forme pesano circa 1–2
    kB compressi;
  - la fonte «token di una bestia nella stanza» è rimandata: serve un convertitore dalla scheda alla forma (fatto il
    16/11 sera, «I punti rimasti»);
  - dopo «Usa e salva» il campo mostra per 10 secondi l'elenco appena scritto, finché la scheda letta di nuovo non ce
    l'ha: la scheda della console non si ridisegna quando cambia solo la scheda del personaggio.
- **Prove:**
  - test: `test/transformationCore.test.js` (22), `test/classFeatureUndoIntegration.test.js` (attivazione,
    rifiuto, Annulla), `test/pcAttackFeatureForm.test.js`, `test/initiativeCardSaveTransportRegression.test.js`
    (le forme nel registro della stanza e in un'altra scena), `test/druidFeatureRuntime.test.js` (cambiato per
    scelta);
  - suite completa in copia pulita (HEAD `50b96ef6` più il lotto): 6265 test verdi;
  - banco 5206 dalla copia pulita, con la console vera: menu con la forma non ammessa spenta, «Attiva» senza forma,
    lupo dalle rapide, coccodrillo da testo e da JSON con «Usa e salva», pill e uso spesi, PF invariati.
- **Prova in stanza:** voce B30 di `PROVE_IN_STANZA.md`.

**W2b · Gli incantesimi dal pannello.** Va dopo W5, insieme a W7: una pill che
cambia i PF di un altro non deve arrivare prima del piano dei PF. In W2 si
prepara solo `transformationPill(kind, form, source)`, usata da entrambi.

**Test:**
- `test/druidFeatureRuntime.test.js:86-94` cambia per scelta: la pill ha
  `mechanics.transformation` e non tocca ancora i PF;
- `test/pcAttackFeatureForm.test.js`:
  - il campo «Forma», le forme filtrate per livello e circolo;
  - «Altra forma…»: «Usa» e «Usa e salva», anche con 8 rapide già piene;
- `test/transformationCore.test.js`, per `transformationFormFromImport`:
  - lupo e serpente costrittore gigante, da JSON e da testo;
  - tipo o GS mancanti;
  - una forma rifiutata, con il motivo;
  - uno statblock 2024 escluso.

**Banco:**
- druido di 2° e di 8°; Circolo della Luna al 6°;
- la console mostra solo le forme ammesse; la pill porta nome, CA e velocità
  della forma nel dettaglio;
- «Altra forma…»:
  - dall'archivio, un orso polare usato una volta;
  - da testo, un serpente costrittore gigante salvato al posto di una rapida;
  - una forma oltre il limite, rifiutata.

**Stanza:**
- il GM sceglie dall'archivio;
- online il giocatore sceglie dalle forme rapide e incolla un JSON con «Altra
  forma…»;
- il GM importa una forma per il giocatore dalla console del druido e la salva
  tra le rapide.

### W3 · La console usa la forma

**W3a · Azioni.**
- `src/spellGrantedActionsCore.js`: una funzione nuova,
  `transformationGrantedActions(item)`. Legge la pill della forma e dà le
  azioni e il multiattacco come azioni concesse, con lo stesso prefisso di id
  del Soffio del drago o uno suo (`transformation-grant:`).
- `src/pcAttackPickerCore.js:46`, `pcAttackPickerEntries`:
  - quando la forma è attiva, le armi e gli incantesimi della scheda si
    nascondono;
  - gli incantesimi restano se `canCast` è vero: Incantesimi Bestiali al 18°,
    Trasformazione con una forma che parla.
- **Colpo Primordiale** (Luna, 6°): gli attacchi della forma sono magici. Si
  usa il segno «arma magica» delle difese contro le armi non magiche, già nella
  console.

**W3b · Il bersaglio trasformato.** `transformedCardView(card, pill)` dà la
scheda vista con la forma: CA, TS fisici, modificatori, immunità e sensi. Se
`keepsMind` è vero, i TS mentali restano del PG; se `keepsFeatures` è vero, la
competenza del PG si somma e vince il bonus più alto (G26). Va chiamata nei
lettori che contano al tavolo:
- `pcAttackTargetSaveBonus` (`src/pcAttackCore.js:75`);
- `pcAttackTargetConditionImmune` (`:88`) e l'Evasione (`:97`);
- la CA dell'avviso di reazione (`src/reactionPromptView.js:51`);
- la CA mostrata sulla card del tracker.

Le difese della forma vanno in `mechanics.damageDefenses` della pill: le legge
già `effectDamageDefensesForItem`, unite a quelle del PG (G27).

**W3c · Un mostro trasformato** (prepara W7): la console dei mostri mostra le
azioni della forma al posto di quelle dello statblock, e lo statblock resta
intatto sulla scheda. Va bene anche dopo W5.

**Il resto:** 35 file leggono `initiativeCard` direttamente **[V]**. Gli altri
lettori restano sulla scheda del PG; la lista di chi resta fuori va nel commit
di W3.

**Test:** `test/pcAttackPicker.test.js`, `test/pcAttackSpells.test.js`,
`test/transformationCore.test.js` (`transformedCardView`), `test/capOrigin.test.js`
(le azioni concesse non cambiano per il Soffio).

**Banco:** druido in lupo, che morde con Atterrare e vede i TS del lupo sul
bersaglio; Circolo della Luna al 6° contro una creatura resistente alle armi non
magiche.

**Stanza:** console del giocatore online, in vista compatta e in vista espansa.

**Da coordinare:** `pc-attack.js` e `pcAttackCore.js` sono aperti per T6 (azioni
di turno). W3 va fatto dopo il commit di T6, o d'accordo con quella sessione.

**W3a e W3b fatti il 16/11** (non committati), senza toccare `pc-attack.js` né
`pcAttackExecution.js`, aperti per T6.
- **File:**
  - `src/transformationFormsCore.js`: le azioni della forma diventano azioni rapide della scheda
    (`sanitizeQuickAction`, id `form-1`…); `activeTransformation` e `transformedCardView` (G26);
  - `src/transformationCore.js`: l'istantanea converte gli attacchi dello statblock con
    `parseCharacterSheetImport`, come l'import della scheda;
  - `src/spellGrantedActionsCore.js`: gli attacchi della forma fra le azioni concesse, id
    `spell-grant:form-<attivazione>-<azione>`, magici col Colpo Primordiale; l'elenco ha la proprietà
    `transformation` (`{ name, canCast }`, Incantesimi Bestiali al 18°);
  - `src/pcAttackPickerCore.js`: in forma, armi e soffio della scheda da parte, e incantesimi e trucchetti salvo
    `canCast`;
  - `src/pcAttackCore.js`: `pcAttackTargetSaveBonus` con `transformedCardView`, `pcAttackTargetConditionImmune` con
    le immunità della forma (G27);
  - `src/reactionPromptView.js`: la CA dell'avviso di reazione;
  - `src/classFeatureRuntime.js`: le difese della forma in `mechanics.damageDefenses` della pill (G27).
- **Trovato al banco:** `sanitizeId` (`quickActionsCore.js:75`) tiene solo `[a-zA-Z0-9:_-]`, al massimo 96
  caratteri. Il primo id (`…#form-1`, con l'id intero della pill) cambiava nella console, che non trovava più
  l'azione. Ora l'id è corto e già pulito, e un test lo fissa.
- **Rimandati all'aggancio in `pc-attack.js`, dopo T6:**
  - la riga «Multiattacco», che la console legge solo dal profilo mostro;
  - la CA sulla card del tracker (`initiativeList.js`, fragile e aperto da altri).
- **Prove:**
  - test: `test/transformationConsole.test.js` (nuovo, 6), `test/transformationCore.test.js`,
    `test/classFeatureUndoIntegration.test.js` (difese sulla pill);
  - suite completa in copia pulita (HEAD `5b236f99` più W1–W3);
  - banco 5206 dalla copia: Luna al 6° in Brown Bear, Bite ✦ e Claws ✦ senza la scimitarra né i trucchetti,
    Claws registrato su Dars (60 → 49) con «✦ Magica» acceso.
- **Prova in stanza:** voce B34 di `PROVE_IN_STANZA.md`.

### W4 · Velocità e taglia

**W4a · Velocità.**
- `src/movementProfileCore.js`, `baseModeSources` (`:186`): un campo nuovo,
  `replaceMeters`, che sostituisce la sorgente di un modo anche con un valore
  più basso. Va calcolato prima di `grantMeters` di altre pill, così Passo
  Veloce e Velocità si applicano alla forma.
- I modi che la forma non ha si tolgono con `exclusiveModes`, che esiste già
  (`:222`).
- La pill porta `mechanics.movement.modes` costruito dalla forma.

**W4b · Taglia.** Una funzione nuova, `applyTransformationTokenSize`, accanto a
`applyMonsterTokenSize`, con `setTokenCells` e lo spostamento non contato da
`suppressMovementHistory`. La scala e la posizione di prima vanno in
`tokenBefore`. Alla fine della forma tornano, anche dopo un Annulla: la taglia è
fuori dalla Cronologia. Come farlo è G36.

**Test:**
- `test/monsterSpeeds.test.js`, che già carica `movementProfileCore.js`, o un
  test nuovo accanto: lupo 12 m su druido 9 m; rospo gigante 6 m su druido
  9 m (più bassa); Passo Veloce sopra la forma; un druido trattenuto resta a 0;
- `test/tokenSize.test.js`: Grande e ritorno.

**Banco:** il riquadro Movimento mostra il passo della forma e il nuoto dello
squalo; la taglia dell'orso bruno e il ritorno.

**Stanza:** il giocatore muove la forma (voce dello Speed Tracker); la taglia su
una griglia esagonale, se il gruppo la usa.

**W4a e W4b fatti il 16/11** (non committati).
- **File:**
  - `src/movementProfileCore.js`: `replaceMeters` in `baseModeSources`, che sostituisce la velocità di un modo prima
    degli altri effetti; conta tra i motivi del modo;
  - `src/classFeatureRuntime.js`: la pill porta `mechanics.movement` con le velocità della forma, e `suppressModes`
    per il passo di una forma che non cammina;
  - `src/transformationTokenSizeCore.js`, nuovo: `planTransformationTokenSizes`, il pianificatore puro;
  - `src/transformationTokenSize.js`, nuovo: il controllore nel background del GM (G36), sul dominio `effects`;
  - `src/background.js`: l'import e il montaggio, accanto agli altri controllori.
- **Scelte:**
  - il controllore ascolta le pill, non la scala dei token: un token ridimensionato a mano non viene rimesso;
  - alla fine torna solo la scala, non la posizione: la bestia può essersi mossa;
  - il riallineamento alla griglia è uno spostamento che lo Speed Tracker non conta (`suppressMovementHistory`).
- **Prove:**
  - test: `test/transformationMovement.test.js` (nuovo, 6) e un test in `test/classFeatureUndoIntegration.test.js`;
  - suite completa in copia pulita (HEAD `f596fce8` più W1–W4);
  - banco 5206 dalla copia: Mira in Brown Bear sale a scala 2 con la scala di prima nel campo, e il movimento è 12 m e
    9 m in scalata, con il motivo «Forma Selvatica · Brown Bear»; «Termina» e l'Annulla la riportano a scala 1, senza
    il campo. Il banco disegna i token con una misura sua: la taglia sullo schermo resta da vedere in stanza.
- **Prova in stanza:** voce B35 di `PROVE_IN_STANZA.md`.

### W5 · I PF della forma (strada a)

Il piano esatto è nel §5. I passi:

| Passo | Cosa fa | File |
| --- | --- | --- |
| W5a | Core puro: inizio, ritorno a 0 con l'eccesso, fine | `transformationCore.js` |
| W5b | Il coordinatore: `hp:set`, patch con `fields.hp`, pill che arriva e pill che finisce, gli effetti sul massimo sullo `stash` | `effectsMutations.js` |
| W5c | Il pannello delle aree, che scrive i PF da sé | `spellAreaResolutionExecutor.js` |
| W5d | Memoria: ActorVitals e `hpMemory` | `actorVitalsStore.js`, `hpMemory.js` |
| W5e | Riposo, editor in linea, gli altri scrittori di PF interi, anteprime, log | vari |

W5b, W5c e W5d vanno nello stesso commit:
- un percorso senza ritorno lascerebbe il druido a 0 PF della forma, con i tiri
  contro la morte misurati sul massimo della bestia;
- senza il filtro della memoria, i PF della bestia finirebbero nel registro del
  druido.

W5e può essere un commit a parte, ma nessun push prima che W5 sia intero: senza
W5e un riposo curerebbe la bestia invece del druido.

**Fatto il 16/11** (W5a–W5e, non committato; via dell'utente: «Sì, W5»).
- **W5a:** i tre piani puri stanno in un modulo nuovo e leggero,
  `src/transformationHpCore.js`, e non in `transformationCore.js`: il coordinatore
  e la memoria lo caricano nel background, e `transformationCore.js` porta con
  sé 5eTools. Lo `stash` è `mechanics.transformation.stash`; una pill senza
  `stash` (dalla scheda, o messa prima di W5) non scambia mai i PF.
- **W5b, `effectsMutations.js`:**
  - il ritorno a 0 nel blocco `hp:set` e in quello delle patch
    (`transformationRevertedWrite`), prima di Interdizione, TS contro la morte,
    concentrazione e condizioni che finiscono col danno;
  - la rimozione porta il segno `transformationReverted`;
  - il «Privo di sensi» che un promemoria aveva aggiunto leggendo la forma a 0
    si toglie, e decide quello del coordinatore;
  - le pill che arrivano, cambiano o finiscono le pianifica
    `planCommandTransformationWrites`, prima di `planCommandMaxHpWrites`, che salta
    quelle creature (`skipIds`): lo `stash` va sulla pill con un
    `condition:set-instances` e il piano si ricostruisce;
  - una forma nuova prende il posto della vecchia (G28);
  - gli effetti sul massimo spostano lo `stash` (G33).
- **W5c, `spellAreaResolutionExecutor.js`:**
  - `applyAreaTransformationReverts` sta dentro `applyAreaReactionHp`, tra
    Legame e Interdizione: la voce diventa quella della creatura;
  - `requested` resta il danno intero, per la CD della concentrazione;
  - Disintegrazione e Dito della morte leggono la creatura, non la forma (G40);
  - un commit fallito rimette la forma (`restoreHPIfUnchanged`).
- **W5d, memoria:**
  - `validCanonicalHP` in `actorVitalsStore.js` legge lo `stash`;
  - `syncHPBatchToMemory` e `persistRemovedHPItems` in `hpMemory.js` fanno lo
    stesso;
  - G41: un token ancora in forma con PF diversi nel registro non viene
    riscritto. La forma finisce con un comando del coordinatore, nel modulo nuovo
    `transformationHpRestore.js`: rimozione con il segno, i PF del registro e un
    intento «rest» (nessun danno).
- **W5e:**
  - riposo del gruppo dallo `stash`, con la forma che finisce (G38);
  - import dei PF da statblock e collegamento a PF condivisi rifiutano una
    creatura in forma (§5.13);
  - la Cronologia composta (editor in linea, pannelli) porta nel log anche le
    righe di reazione, che prima perdeva;
  - un avviso dell'editor in linea a 0 (G39);
  - la riga «torna alla sua forma: PF 34 → 29» nell'anteprima del pannello
    unificato e della console (G35);
  - i testi della pill e della capacità non dicono più «PF a mano».
- **Non fatto:**
  - il test di contratto sugli intenti degli scrittori (§5.14): il ritorno legge
    il danno dall'intento o, senza intento, dal calo dei PF, quindi uno scrittore
    senza intento perde solo l'eccesso, come l'editor in linea;
  - i PF del druido nel dettaglio della pill: li dice la riga del registro.
- **Test:** `test/transformationHpCore.test.js` (10),
  `test/transformationHpIntegration.test.js` (18, coordinatore vero, Cronologia,
  pannello delle aree e riposo), `test/transformationMemory.test.js` (4); cambiano
  `test/classFeatureUndoIntegration.test.js` (la console ora scambia i PF) e
  `test/druidFeatureRuntime.test.js` (il testo).
- **Prove:**
  - suite completa in una copia pulita (HEAD `06e407aa` più W1–W5, con i soli
    hunk miei in `pc-attack.js` e `initiativeList.js`): 6330 test, nessun
    fallimento; build di controllo riuscita;
  - banco 5206 dalla copia, con la console vera:
    - Mira (34/40) in Brown Bear passa a 34/34, con lo `stash` 34/40;
    - l'anteprima di un colpo da 40 dalla console di Dars dice «PF 34 → 0 ·
      torna alla sua forma: PF 34 → 28 (max 40)»;
    - registrato, Mira è 28/40, senza pill e senza attivazione, e la Cronologia
      ha la riga del ritorno; l'Annulla rimette l'orso 34/34 con pill e
      attivazione;
    - un colpo da 10 (24/34) e poi **Termina**: Mira torna 34/40;
  - non visti al banco: la barra PF sulla mappa vera, il pannello unificato,
    l'editor in linea, il riposo e il cambio di scena (coperti dai test, nella
    voce B37).

### W6 · Circolo della Luna

- **Forma Selvatica da Combattimento:** l'attivazione della pill come azione
  bonus per il Circolo della Luna; l'avviso del turno lo dice. È un dato in
  `class-features-runtime.json`, con il ramo del circolo.
- **Cura con lo slot:**
  - azione bonus, solo in forma: 1d8 per livello dello slot;
  - precedente: Imposizione delle mani (pool e popup di cura);
  - la cura va sulla forma, cioè su `meta.hp`. Con la strada (a) basta un
    `hp:set` di cura normale, che passa dal coordinatore;
  - lo slot si spende come gli altri.
- **Forma Elementale:** due usi, elementali dell'aria, dell'acqua, del fuoco e
  della terra, con il filtro di W1 per tipo.
- **Durata in ore:** metà del livello da druido, in round (600 per ora), come
  gli altri effetti di un'ora.
- **Mille Forme:** resta come oggi. Alterare sé stesso è già automatizzato
  come incantesimo.
- **Test:** `test/druidFeatureRuntime.test.js` (azione bonus, cura, due usi).
- **Banco:** cura con uno slot di 2° sulla forma ferita.
- **Stanza:** Luna in partita, dall'azione bonus alla cura.

**Fatto il 16/11** (non committato; via dell'utente: «Prima W6 e W7»).
- **Azione bonus:**
  - un dato della Forma Selvatica da Combattimento
    (`passiveMechanics.activationOverrides`);
  - `getEnabledClassFeatures` (`classFeatureCatalog.js`) lo applica a una copia
    della Forma Selvatica;
  - la console dice «Azione bonus»; il catalogo resta «Azione»;
  - la Forma Selvatica Elementale resta un'azione, come nel PHB.
- **Cura con lo slot:**
  - la Forma Selvatica da Combattimento ha un adattatore nuovo,
    `wild-shape-slot-heal` (`healWildShapeWithSlot` in `classFeatureRuntime.js`);
  - in console, campi «Slot» e «PF recuperati (tirati al tavolo)», con il
    controllo da N a 8N;
  - lo slot si spende e i PF della forma salgono nello stesso comando, con un
    solo Annulla;
  - fuori forma la capacità è spenta.
- **Durata:** metà del livello da druido in ore, 600 round l'una, nella
  `duration.rounds` della capacità quando la forma viene dalla console.
- **Non fatto:** l'avviso del turno sull'azione bonus; la console la dice già.
- **Test:**
  - `test/classFeatureUndoIntegration.test.js`: durata, azione bonus, cura,
    Annulla;
  - `test/pcAttackFeatureForm.test.js`: il modulo;
  - cambiano i conteggi in `test/classFeatureCatalog.test.js`,
    `test/paladinDevotionFeatureRuntime.test.js` e
    `test/druidFeatureRuntime.test.js` (272 implementate).
- **Banco 5206:** orso a 14/34, slot di 2° e 9 PF: 23/34, slot 2 su 3, voce
  nella Cronologia.

### W7 · Gli incantesimi

Riusano W1–W5. Ogni incantesimo è un sotto-lotto, nell'ordine di quanto pesano
al tavolo:

- **W7a · Trasformazione:** su di sé, come la Forma Selvatica.
  - Tiene capacità, competenze e mente.
  - Si cambia forma con un'azione. I PF della forma nuova non salgono sopra
    quelli attuali; lo `stash` resta quello della forma normale.
  - Limite: il livello di chi lancia.
- **W7b · Metamorfosi:**
  - su un'altra creatura, anche ostile. Il TS su Saggezza c'è già, e il
    pannello lo chiede solo a chi non è consenziente;
  - la mente è sostituita; niente incantesimi;
  - la concentrazione è di chi lancia: quando finisce, la pill del bersaglio
    finisce e i PF tornano (W5b, pill che finisce);
  - su un mostro: W3c per le azioni; i PF del mostro passano per la stessa
    strada (G25);
  - niente effetto su un mutaforma né su una creatura a 0 PF: il pannello lo
    dice.
- **W7c · Metamorfosi Pura:** come Metamorfosi, con qualsiasi tipo. Il pulsante
  «Rendi permanente» (G30) è scartato dall'utente il 16/11: la forma permanente
  resta al tavolo. Oggetti fuori (G31).
- **W7d · Forme Animali:** più bersagli consenzienti, ognuno con la sua forma;
  durata 24 ore; chi lancia cambia una forma con un'azione.
- **W7e** (G32): Metamorfosi di Massa con i PF temporanei di CAP-TEMP, e
  l'Impulso 77–78.

**Dove si aggancia:**
- la scelta della forma per bersaglio va nel pannello degli incantesimi. Il
  precedente è il campo per bersaglio del Banchetto degli eroi (`feastRoll`,
  `src/spellSaveWorkflowRules.js:741`);
- anche lì ci sono le forme rapide e «Altra forma…» di W2a. Le rapide sono
  quelle della scheda di chi lancia: il mago che usa Metamorfosi tiene le
  sue;
- la pill passa da `catalogSpellApplicationOperations`
  (`src/spellLifecycleOperationsCore.js:116`) con `mechanics.transformation`,
  come Aiuto con `maxHpEffectForCast` (`src/maxHpModifierCore.js:106`) **[D]**.

**Dati:** `data/spell-implementation-status.json` (la riga di ogni
incantesimo), l'audit e il registro (`npm run audit:spells`,
`npm run polish:register`), `check:spells` (conteggi a mano).

**Test:** `test/transformationSpells.test.js`, nuovo; l'integrazione del
pannello, sull'impianto di `test/maxHpIntegration.test.js`.

**Banco:** Metamorfosi su un ogre ostile, con TS fallito; il mago perde la
concentrazione e l'ogre torna con i suoi PF. Forme Animali su tre PG.

**Stanza:** una voce per incantesimo.

**W7a–W7d fatti il 16/11** (non committati; via dell'utente: «Prima W6 e W7»).
- **La strada:**
  - una regola di workflow per incantesimo in `spellSaveWorkflowRules.js`, con il
    campo per bersaglio «Forma» (tipo `transformation-form`): i quattro passano
    dal ciclo di vita semplice al pannello delle aree, come il Banchetto degli eroi;
  - nel pannello delle aree, dopo la risoluzione del TS, ogni bersaglio preso ha
    una pill dell'istanza con la forma della sua riga (`transformationSpellsCore.js`);
  - la pill finisce con la concentrazione di chi lancia, e W5 scambia i PF.
- **Il campo «Forma»:** è quello della console (W2a, `pcAttackTransformationField.js`)
  nella riga del bersaglio (`spellUnifiedPanelTargetView.js`): forme rapide di chi
  lancia, «Altra forma…», salvataggio sulla sua scheda. I limiti arrivano con il
  campo (`field.context`).
- **Le fonti** (`TRANSFORMATION_SPELL_TEMPLATES` in `transformationFormsCore.js`):
  - Trasformazione: chi lancia, entro il suo livello, tiene mente, capacità e
    incantesimi;
  - Metamorfosi: una bestia entro il GS o il livello del bersaglio, niente
    effetto a 0 PF;
  - Metamorfosi Pura: qualsiasi tipo;
  - Forme Animali: più bersagli consenzienti, Grande o meno, GS 4 o meno.
- **Scelte:**
  - Metamorfosi e Metamorfosi Pura: il TS si tira al tavolo, come vuole il
    pannello per «solo se non consenziente»; chi lo supera si toglie dai bersagli;
  - la scheda di un mostro non tiene il suo GS: il campo avvisa che quel limite
    lo controlla il tavolo; per un PG vale il livello;
  - Trasformazione: il GM seleziona il token di chi lancia come bersaglio; un
    altro bersaglio viene rifiutato;
  - la parte pill e PF in comune con la Forma Selvatica sta in
    `transformationPillParts`.
- **Dati:** l'audit rigenerato (`npm run audit:spells`) porta i quattro da
  «solo tracciati» a «parziali»; le righe di `data/spell-implementation-status.json`
  dicono cosa fanno e cosa manca, e restano «PARTIAL».
- **Non fatto:**
  - **W7e** (Metamorfosi di Massa e Impulso 77–78): G32 chiede di verificare
    prima il testo di Xanathar, che nel repository c'è solo come scheda senza
    descrizione; in più i PF temporanei pari a quelli della forma vogliono una
    pill che non scambia i PF, e l'Impulso va agganciato al suo runtime;
  - **«Rendi permanente» (G30):** serviva un comando che tolga la concentrazione
    senza terminare l'incantesimo, che il coordinatore non ha. Scartato
    dall'utente il 16/11 («possiamo scartarlo come punto»);
  - il cambio di forma durante Trasformazione e Forme Animali: si rilancia (fatto il 16/11 sera, «Cambia forma»
    nella console);
  - le azioni di un mostro in forma nella console Boss (W3c).
- **Test:**
  - `test/transformationSpells.test.js` (nuovo, 3);
  - `test/transformationHpIntegration.test.js` (+5, il pannello delle aree vero);
  - cambiano gli impianti dei test a tappeto: `test-support/spellSweepHarness.js`
    e `test/spellUnifiedExecutionParity.test.js` danno una forma di prova.
- **Banco 5206:**
  - Metamorfosi di Sera su un goblin: la riga ha «Forma» con il lupo e «Altra
    forma…», il pulsante aspetta la scelta;
  - con il lupo il goblin è 11/11, con i suoi 7/7 sulla pill, slot di 4° speso;
  - persa la concentrazione, il goblin torna 7/7.
- **Suite e build (W6 e W7 insieme):** copia pulita da HEAD `368f58c9` più W1–W7,
  con l'audit rigenerato lì: 6347 test, un solo rosso, il conteggio delle
  capacità in `test/paladinDevotionFeatureRuntime.test.js` (271 → 272), corretto
  e riprovato da solo (13 su 13); build riuscita.

**W7e fatto il 16/11** (non committato; via dell'utente: «Sì, come proposto»).
- **Il testo:** verificato sul PDF della Guida di Xanathar dell'utente: fino a
  dieci creature entro 36 m; TS su Saggezza solo per chi non è consenziente; una
  bestia fino al GS del bersaglio, o metà del suo livello; statistiche e mente
  sostituite; PF propri e alleanza restano; PF temporanei pari a quelli della
  forma, non sostituibili; senza più PF temporanei, morto o a fine incantesimo
  torna normale.
- **Le scelte (16/11):**
  - la pecora dell'Impulso ha le statistiche della capra del Manuale dei Mostri
    2014, sotto il nome «Pecora»;
  - il coordinatore tiene i PF temporanei della forma e rifiuta quelli di altre
    fonti, e lo dice;
  - «Morto» chiude la forma.
- **Metamorfosi di Massa:**
  - un tipo nuovo, `mass-polymorph`, con `hitPoints: "temporary"`: W5 non
    scambia i PF (`transformationFormHpOf` lo salta);
  - il limite a metà livello in `transformationLimits`; la regola di workflow
    (dieci bersagli, 36 m, TS al tavolo, «Forma» per riga);
  - la pill porta `endsWhenTempHpGone` e `tempHpLocked`; quando arriva, il
    coordinatore dà i PF temporanei della forma con la pill come fonte
    (`planCommandTemporaryFormWrites`); a 0 la pill finisce, e a fine
    incantesimo i PF temporanei se ne vanno (CAP-TEMP, T3a);
  - il blocco: `lockedTemporaryHpWrite` nei blocchi `hp:set` e delle patch, e lo
    stesso nel pannello delle aree; abbassarli (danno, riposo, a mano) resta
    permesso;
  - il messaggio: una riga `temp-hp-locked` nel risultato del comando e nel
    registro; una notifica di Owlbear da `runEffectsMutation`, qualunque sia chi
    scrive; la riga di stato del popup dei PF;
  - «Morto» (morte senza danno) toglie la pill, nel coordinatore e nel pannello
    delle aree.
- **L'Impulso 77–78:** `WILD_MAGIC_SURGE_SHEEP_FORM` in `wildMagicSurgeCore.js`;
  la rotta del pannello porta la pecora nella riga dello stregone
  (`targetContext`). Senza slot e senza concentrazione, come prima.
- **Dati:** la riga di Metamorfosi di Massa passa a «COMPLETE / CURRENT» (era
  «nessuna automazione richiesta»), con i totali in testa; audit rigenerato.
- **Test:** `test/transformationHpIntegration.test.js` (+4: PF temporanei, blocco,
  fine e morte, limite), `test/transformationSpells.test.js` (+2: massa e
  pecora), il tipo nuovo in `test/transformationCore.test.js`, l'impianto dei
  test a tappeto.
- **Banco 5206:**
  - Metamorfosi di Massa di Sera sui due goblin dal pannello vero: 7/7 e 11 PF
    temporanei ciascuno, con la pill come fonte;
  - altri 20 PF temporanei da un'altra fonte: restano gli 11, e la notifica dice
    perché;
  - l'Impulso 77 apre Metamorfosi su Sera con «Importata: Pecora»: Sera diventa
    pecora 4/4, i suoi 38/38 sulla pill.
- **Suite e build:** copia pulita da HEAD `e013c283` più W1–W7e, con l'audit
  rigenerato lì: 6360 test, tutti verdi; build riuscita.

### Dopo le prime prove in stanza (16/11)

Fatte il 16/11 con il via dell'utente («Sì, procedi»), non committate. Prova in
stanza: voce B45.
- **Il numero della barra PF:**
  - in stanza il token del druido diventava Grande giusto, ma il numero dei PF
    e lo spessore della barra raddoppiavano: Owlbear passava loro la scala del
    token, anche se non devono ereditarla;
  - ora `hpbar-items.js` rimette a 1 la scala di barra e numero a ogni ricalcolo
    (`restoreHPBarOwnScale`) e la conta nel controllo «è già a posto?»
    (`hasHPBarOwnScale`). Nessuna creazione né cancellazione: una sola scrittura
    in più per barra, poi niente;
  - la barra resta larga quanto il token, come per i mostri Grandi;
  - test in `test/hpBarEqualWrites.test.js`.
- **Il ritratto di 5eTools sul token:**
  - le scelte: casella accesa quando il ritratto c'è e si carica; la card del
    tracker segue il token;
  - la forma tiene il percorso del ritratto (`portrait`), preso dallo statblock
    di 5eTools, o dal suo riferimento per le forme rapide salvate prima
    (`transformationFormPortraitPath`); l'indirizzo è quello delle immagini di
    5eTools nelle Opzioni del GM;
  - il campo «Forma» (console e pannello degli incantesimi) mostra «Usa il
    ritratto della forma sul token» con l'anteprima, solo dopo che il file si è
    caricato; la scelta va sulla pill (`mechanics.transformation.portrait`:
    indirizzo e misure);
  - il controllore di W4b ora mette anche il ritratto (`setTokenPortrait`, che
    tiene l'ingombro) e alla fine rimette immagine, griglia e scala: il campo
    `transformationTokenBefore` le salva tutte e tre alla prima modifica;
  - una forma nuova senza ritratto rimette l'immagine; i boss non lo indossano;
  - la memoria dei PF dei PG senza identità (nome e immagine) usa l'immagine
    messa da parte, così il ritratto non crea un PG nuovo;
  - test: `test/transformationMovement.test.js` (pianificatore),
    `test/transformationSpells.test.js` (percorso e pill),
    `test/pcAttackFeatureForm.test.js` (richiesta),
    `test/classFeatureUndoIntegration.test.js` (attivazione),
    `test/transformationMemory.test.js` (memoria).
- **Lo statblock della forma da leggere** (via dell'utente: «Sì, procedi»):
  - prima la forma teneva solo i nomi dei tratti e il testo del multiattacco, e
    nessuna schermata li mostrava;
  - ora `transformationStatblockCore.js` ricava le voci della forma dallo
    statblock completo, letto con il caricatore dei mostri
    (`monsterStatblockTextLoader.js`: l'archivio di 5eTools del GM, per il
    riferimento «Brown Bear|MM»), o senza archivio dall'istantanea;
  - nella console, mentre il PG è in forma, la scheda Capacità ha «Forma:
    tratti», «Forma: multiattacco e altre azioni» (non gli attacchi, che stanno
    in Attacchi), «Forma: reazioni» e «Forma: statblock», carte da leggere come i
    tratti dei mostri;
  - nel campo «Forma» (console e pannello degli incantesimi) il pulsante
    **Statblock** apre lo statblock completo della forma scelta;
  - scelta confermata: il testo completo non va nelle forme rapide (spazio della
    stanza);
  - test: `test/transformationStatblock.test.js` (nuovo, 3); banco: statblock nel
    campo, e in forma le tre sezioni con Keen Smell, Multiattack e lo statblock;
  - suite in copia pulita da HEAD `ab7c0f40` più tutto il lavoro: 6381 test, tutti
    verdi; build riuscita.
- **La Guida utente** (`docs/GUIDA_UTENTE.md`, capitolo 5): una sezione nuova,
  «Forme: Forma Selvatica e incantesimi di trasformazione», con la scelta della
  forma, cosa cambia in forma, i cinque incantesimi e cosa resta al tavolo.
  L'avviso dell'editor in linea ora rimanda alla Console effetti manuali, con lo
  stesso nome della guida.
- **Banco 5206:** con uno specchio locale delle immagini, la console mostra la
  casella spuntata con l'anteprima; attivata la forma, il token indossa il
  ritratto a 2×2 e il campo salva immagine, griglia e scala; **Termina** rimette
  tutto com'era. Il numero della barra non si vede al banco: è nella B45.
- **Suite e build:** copia pulita da HEAD `234308b2` più W1–W7e e queste due
  modifiche, con l'audit rigenerato lì: 6373 test, tutti verdi; build riuscita.
- **Gli altri manuali in «Altra forma…»** (domanda dell'utente: «le metamorfosi
  prendono solo dal MM»; via: «Sì, correggi»):
  - la ricerca legge già tutti i libri dell'archivio di 5eTools del GM; restano
    fuori solo i libri e gli statblock delle regole 2024 (`isFiveTools2024`);
  - il limite trovato: l'archivio si leggeva una volta per pagina, quindi un
    libro aggiunto dalla scheda con la console aperta non compariva finché non si
    riapriva la console. Ora `pcAttackTransformationField.js` lo rilegge a ogni
    apertura di «Altra forma…» e lo tiene mentre il pannello resta aperto;
  - restano come prima: i bestiari caricati con «Carica file» non entrano
    nell'archivio (in «Altra forma…» si incolla un mostro alla volta), e il
    giocatore online non ha l'archivio del GM;
  - test: `test/transformationFormArchive.test.js` (nuovo, 1: con la riga tolta
    fallisce); prova in stanza: voce B45, «Un altro libro»;
  - suite in copia pulita da HEAD `bf37bcc2` più tutto il lavoro delle
    trasformazioni: 6408 test, tutti verdi; build riuscita.

### I punti rimasti (16/11, sera)

Fatti con il via dell'utente («Ok, lavora sui punti rimanenti del piano»), non
committati. G30 è scartato (vedi sopra); W3c resta saltato. Prova in stanza:
voce B58.
- **Dopo Termina:** la console ferma su un attacco della forma chiedeva un'azione
  che non c'era più («Azione di attacco non trovata»). Ora
  `getPcAttackPresentation` (`pcAttackExecution.js`) apre l'azione predefinita
  quando l'azione chiesta è di una pill che non c'è più (una forma finita, anche
  Soffio del Drago a concentrazione finita); un'azione della scheda che manca dà
  l'errore di prima. Test: `test/transformationConsoleEnd.test.js` (nuovo, 2).
- **La durata dalla scheda:** la Forma Selvatica attivata dalla scheda
  personaggio (senza forma) non scadeva. Ora `transformationFeatureWithDuration`
  (`classFeatureRuntime.js`) dà la stessa durata a console e scheda. Test in
  `test/classFeatureUndoIntegration.test.js`.
- **Il multiattacco:** `renderMonster` (`pc-attack.js`) mostra il multiattacco
  della forma, o nessuno: quello della creatura resta da parte. Test in
  `test/pcAttackPopover.test.js`.
- **La CA:** la card del tracker non mostra la CA (il piano lo supponeva). La
  mostra la scheda della card (`initiative-card-modal.js`, `renderView`): ora in
  forma è quella della forma, con la sua nel titolo
  (`transformationArmorClassView`). `initiativeList.js` non cambia. Test in
  `test/transformationConsole.test.js`.
- **G25, l'etichetta con il motivo:** `withTransformationTargetsChecked`
  (`effectsMutations.js`, accanto a M9) divide un `condition:add` con una forma
  che scambia i PF: per un boss, un token d'incantesimo, PF condivisi o non
  tracciati la pill arriva senza forma, velocità e difese, con il motivo nel
  dettaglio (`transformationConditionOptionsAsLabel`). Nessuna scrittura dei PF
  cambia: il coordinatore saltava già quelle creature. Le forme con PF temporanei
  (Metamorfosi di Massa) restano come prima. Test in
  `test/transformationHpIntegration.test.js`.
- **Il contratto degli intenti (§5.14):** `test/hpIntentContract.test.js`
  (nuovo, 2): ogni scrittura dei PF calcolata da un danno o da una cura dichiara
  `hpIntent`, e chi scrive i PF senza intenti è in un elenco con il motivo
  (editor in linea, import da statblock, idratazione). Ha trovato due scrittori
  senza intento, ora corretti in `bossActionExecutionCore.js`: il lancio del boss
  (bersaglio e collisione, danno) e il drenaggio (cura del boss).
- **«Token nella stanza»:** in «Altra forma…» il menu **Da un token nella
  stanza…** elenca i mostri della scena (`transformationTokenSources`). Una card
  da 5eTools si legge dall'archivio del GM; le altre danno la forma dai numeri
  della card (`transformationFormFromToken`), con tipo e GS da scegliere come per
  un testo incollato. La console passa i suoi bersagli, il pannello degli
  incantesimi i suoi lanciatori. Test in `test/transformationCore.test.js` e
  `test/transformationFormArchive.test.js`.
- **Cambia forma (G28):** in Capacità, per una creatura in Trasformazione o
  Forme Animali, la voce **Cambia forma** (gruppo «Forma: cambia forma») con il
  campo «Forma nuova» (limiti dell'incantesimo, forme rapide di chi lancia) e un
  comando (`transformationChangeRuntime.js`). La pill nuova copia la vecchia,
  con lo stesso `parentEffectId` (la concentrazione la toglie ancora) e un id
  nuovo: il coordinatore la legge come forma che arriva su una forma, tiene i PF
  messi da parte e, per Trasformazione, non alza i PF sopra gli attuali.
  Trasformazione e Forme Animali sono ora «COMPLETE / CURRENT» nella matrice
  degli incantesimi; Metamorfosi Pura resta parziale. Test:
  `test/transformationHpIntegration.test.js` (coordinatore vero),
  `test/transformationConsoleChange.test.js` (nuovo, la console).

## 5. W5: il piano esatto della strada (a)

### 5.1 L'idea, in tre piani puri

Tutti in `src/transformationCore.js`. Nessuno scrive: restituiscono valori che
i percorsi esistenti mettono nelle loro patch.

- **`planTransformationStart({ meta, pill })`**: quando arriva una pill con
  `mechanics.transformation`:
  - `stash = { hp, hpMax }` della forma normale. Sono i PF proiettati del
    comando (`maxHpProjectedFields`, `effectsMutations.js:1163`), senza i PF
    temporanei, che restano nel loro campo (G18);
  - la scrittura `hp = formHp`, `hpMax = form.hpMax`;
  - se una forma c'era già (cambio forma, G28), lo `stash` resta quello della
    forma normale. Per Trasformazione i PF non salgono sopra gli attuali.
- **`planTransformationRevert({ meta, pill, damageToHp })`**: quando un danno
  porta la forma a 0:
  - l'eccesso è `damageToHp - hp` della forma. `damageToHp` è il danno che
    supera i PF temporanei: `hpWriteDamageToHp` (`effectsMutations.js:911`),
    o `requested - absorbedByTempHp` nel pannello delle aree;
  - la scrittura nuova è `hp = max(0, stash.hp - eccesso)`,
    `hpMax = stash.hpMax`;
  - la pill della forma viene rimossa, con il segno `transformationReverted`
    (sotto);
  - il danno passato ai passi dopo è l'eccesso, e la creatura «di prima» è
    quella con lo `stash`.
- **`planTransformationEnd({ meta, pill })`**: quando la pill finisce per altre
  vie (azione bonus, durata, concentrazione, ✕, riposo):
  - `hp = stash.hp`, `hpMax = stash.hpMax`;
  - i PF temporanei restano.

**Il segno sulla rimozione.** Quando il ritorno a 0 ha già scritto i PF del
druido, la pill che finisce non deve riscriverli con lo `stash` intero.
- La rimozione porta `transformationReverted: true`.
- È lo schema di `skipClassFeatureReconcile`, che il piano già legge dalle
  rimozioni (`effectsMutations.js:1846`).
- Un'alternativa è la patch «consapevole», come `maxHpAware`
  (`spellAreaResolutionExecutor.js:2664`). Va bene quando un percorso scrive da
  sé i PF giusti.

**L'ordine dentro il coordinatore.** Il ritorno va **prima** dei passi che
leggono «i PF di prima» e il danno:
- Interdizione alla Morte;
- tiri contro la morte e danno massiccio;
- la concentrazione a 0 PF;
- le condizioni che finiscono col danno.

Così ognuno di questi passi vede il druido con i suoi PF e con il solo eccesso
come danno. È la regola del testo: «non cade privo di sensi finché l'eccesso
non lo porta a 0».

### 5.2 Danno e cura: `calculateQuickHPChange`

`src/quickHpCore.js:123` **[V]** non cambia.
- Riceve i PF della forma (`meta.hp`, `meta.hpMax`) e dà `afterHP` fermo a 0.
- Il ritorno usa `requested` e `absorbedByTempHp`, che restituisce già.
- **Le cure** curano la forma fino al suo massimo: è la regola, ed è il motivo
  della strada (a). Vale anche per la cura della Luna con lo slot.
- **Il danno mentre il druido è a 0 PF** (`deathSaveDamage`) non riguarda la
  forma: a 0 PF della forma il druido è già tornato normale.
- **Chi chiama:** ~60 chiamate in 20 file **[V]**. Nessuna cambia: il ritorno
  sta dove si scrive, non dove si calcola.
- **Le anteprime** restano senza eccesso: la console mostra «PF: 0» della forma
  e non i PF del druido dopo il ritorno. Per esempio
  `pcAttackCore.js:1259` e `spellUnifiedPanelViewCore.js:589`. Proposta: una
  riga «Torna normale: PF del druido 34 → 29» nell'anteprima del pannello
  unificato e della console (G35). Il resto resta com'è.

### 5.3 Il coordinatore: `hp:set` e patch con `fields.hp`

`src/effectsMutations.js` **[V]**.

**Blocco `hp:set`** (`:1583-1648`):
1. Dopo `withWardingBondWrites` (`:1579`) e prima di `planDeathWard`
   (`:1597`), per ogni `update` di una creatura con la pill della forma attiva:
   - se `update.hp <= 0`, chiamare `planTransformationRevert` con
     `damageToHp = hpWriteDamageToHp(update, meta)`;
   - riscrivere `update` con i PF del druido e un intento di danno pari
     all'eccesso (`hpIntents`, come fa `withWardingBondWrites`, `:985`);
   - sostituire `meta` con `{ ...meta, hp: stash.hp, hpMax: stash.hpMax }`
     per i passi dopo;
   - aggiungere la rimozione della pill a `hpOperations`.
2. Interdizione (`:1597`), tiri contro la morte (`planDeathSaveHpWrite`,
   `:922`), concentrazione a 0 (`planZeroHpConcentrationBreak`, `:1022`) e
   «finisce col danno» (`:1636-1643`) leggono il `meta` sostituito. Per
   l'Interdizione serve passare `item` con il `meta` nuovo: `planDeathWard`
   legge `item.metadata[META_KEY].hp` (`reactionHpCore.js:34`).
3. La proiezione `item.metadata[META_KEY] = …` (`:1644`) scrive i PF del
   druido: i comandi dopo nello stesso piano li vedono.

**Danno di Legame di Interdizione:** il danno che ricade su chi lancia si somma
prima del ritorno (`:1579`). Se chi lancia è in forma, il suo `update` passa
dallo stesso ritorno.

**Patch con `fields.hp`** (`:1652-1700`):
- stesso ritorno, prima dell'Interdizione (`:1682`), con
  `patchWrite.hp` e `hpWriteDamageToHp(patchWrite, meta)`;
- la patch è una copia (`metadataPatches = [...metadataPatches]`, `:1651`):
  si riscrivono `hp` e `hpMax`, come fa già l'Interdizione (`:1686`);
- le patch che portano già il conteggio dei tiri contro la morte
  (`DEATH_SAVES_FIELD`) saltano il blocco (`:1656`). Le scrive solo il tiro
  contro la morte (`reminderResolutionCore.js:1652`), su una creatura già a 0
  PF della forma normale: la forma non c'è più. Un test lo fissa.

**Pill che arriva o finisce nel comando:** un pianificatore nuovo,
`planCommandTransformationWrites`, accanto a `planCommandMaxHpWrites`
(`:1817`) e con la stessa forma (`patchLists`, riscrittura delle patch del
comando, una patch aggiunta dove non c'è).
- **Va prima** di `planCommandMaxHpWrites`: Aiuto che arriva o finisce su un
  druido in forma tocca lo `stash`, non i PF della forma (G18, G33).
  - `planCommandMaxHpWrites` salta le creature trasformate con un controllo
    suo.
  - `maxHpWritable` non cambia: decide anche M9 (`withMaxHpTargetsChecked`,
    `:1141`). Se dicesse «no» a un druido in forma, Aiuto arriverebbe come
    etichetta invece che come pill vera.
  - Il pianificatore nuovo applica `planMaxHpChange` allo `stash`.
- **Pill che arriva:** `planTransformationStart`. Lo `stash` va scritto sulla
  pill nello stesso comando.
  - Il chiamante non lo conosce con certezza: un altro comando può aver
    cambiato i PF.
  - Quindi lo scrive il coordinatore. Il piano si ricostruisce con l'istanza
    aggiornata, come per le cadute di CAP-CARRIAGE (`:1773-1782`) e i rialzi
    di CAP-MAXHP (`:1818-1821`).
- **Pill che finisce senza il segno:** `planTransformationEnd`.
- **Pill che finisce con il segno:** niente; il ritorno ha già scritto.
- **La concentrazione di chi lancia** (Metamorfosi su un altro) arriva come
  rimozione della pill nel piano (`concentration:break`). È lo stesso caso di
  Aiuto che finisce, già provato da CAP-MAXHP.

### 5.4 Le tre Interdizioni alla Morte

| Punto | Riga | Cosa cambia |
| --- | --- | --- |
| Coordinatore, `hp:set` | `effectsMutations.js:1597` | Il ritorno va prima; `planDeathWard` riceve l'`item` con lo `stash` e il danno pari all'eccesso |
| Coordinatore, patch | `effectsMutations.js:1682` | Lo stesso, sulla patch copiata |
| Pannello delle aree | `spellAreaResolutionExecutor.js:705` (`applyAreaReactionHp`, `:670`) | Il ritorno va prima del ciclo dell'Interdizione (`:702-715`), su `entry.change` |

**La regola (G34):** l'Interdizione guarda i PF veri della creatura.
- A 0 PF della forma la creatura torna normale. Se l'eccesso non la porta a 0,
  l'Interdizione non scatta e resta.
- Se l'eccesso la porta a 0, scatta e la lascia a 1 PF, nella forma normale.

Il terzo blocco, la morte senza danno di Parola del potere uccidere
(`:716-724`), non cambia: non c'è eccesso da calcolare. Però la forma finisce:
è morta, o l'Interdizione l'ha salvata. Vedi 5.5.

### 5.5 Il pannello delle aree, che scrive i PF da sé

`src/spellAreaResolutionExecutor.js` **[V]**: le voci (`entries`) diventano
patch scritte da `updateHP` (`:2864`), fuori dal blocco PF del coordinatore. Le
sue operazioni sugli effetti vanno invece al coordinatore. Quindi:
1. **Ritorno** in una funzione nuova, `applyAreaTransformationReverts(entries)`.
   Va chiamata dopo `applyAreaReactionHp` per Legame di Interdizione, e prima
   del suo ciclo dell'Interdizione. Per questo il ciclo (`:702`) va separato in
   una funzione sua. Sulle voci di danno con la pill della forma e
   `afterHP <= 0`:
   - `entry.change` diventa: `hp` e `hpMax` dello `stash` come «prima»,
     `afterHP = max(0, stash.hp - eccesso)`, `requested` pari all'eccesso più
     i temporanei assorbiti;
   - in `effectOperations` va la rimozione della pill con il segno.
2. **L'Interdizione** e `planAreaDeathSaves` (`:911`) leggono `entry.change`
   e funzionano senza altre modifiche. `planAreaDeathSaves` legge
   `itemMeta(entry.item)` per i conteggi e le istanze: le istanze restano
   quelle giuste, e `hpMax` viene da `entry.change.hpMax`.
3. **Annulla** (`restoreHPIfUnchanged`, `:2893`): rimette `entry.change.hp` e
   `entry.change.hpMax`. Dopo il ritorno quelli sono lo `stash`, mentre deve
   tornare la forma. Quindi il ritorno tiene `formBefore = { hp, hpMax }` e
   `restoreHPIfUnchanged` usa quello.
4. **Con PF condivisi o un teletrasporto** (`:2472`) i PF passano dal
   coordinatore e valgono 5.3. Una creatura trasformata non ha PF condivisi
   (esclusa, §3).
5. **Morte senza danno e rami PF** (`planAreaHpBranch`, `:631`: Parola del
   potere uccidere, Disintegrazione, Dito della morte):
   - una morte su una forma la uccide come creatura. La pill finisce con il
     segno, e i PF restano a 0;
   - **Disintegrazione:** a 0 PF della forma, la forma finisce e l'eccesso
     passa, senza ridurre il druido in polvere. È la lettura comune del
     testo **[D]**: `planHpBranchAfterDamage` (`hpBranchSpellRules.js:148`)
     va chiamato con la `change` dopo il ritorno.

### 5.6 Tiri contro la morte e danno massiccio

`planDeathSaveHpChange` (`src/deathSaveCore.js:126`) **[V]** non cambia.
- Misura il danno massiccio sul massimo che riceve: `max = hpMax ?? meta.hpMax`
  (`:151`). L'avanzo è il danno oltre i PF di prima (`:165-166`).
- Senza ritorno riceverebbe il massimo della bestia: un lupo da 11 PF morirebbe
  «di danno massiccio» con 22 danni. Con il ritorno prima riceve il massimo del
  druido e il solo eccesso.
- Esempio: druido 34/40 in lupo 11/11, 85 danni. L'eccesso è 74. L'avanzo
  oltre i 34 PF del druido è 40, pari al suo massimo: muore. Con 84 danni
  resta a 0 PF, privo di sensi, con i tiri contro la morte.
- Vale solo per i PG (`:130`, `:146`). Un mostro trasformato (W7b) che arriva a
  0 nella forma vera muore come oggi.
- **Il rialzo da 0 di CAP-MAXHP** (`effectsMutations.js:1207-1213`) non vede
  le creature trasformate: le salta lo stesso controllo di 5.3.

### 5.7 Concentrazione

- **A 0 PF** (`planZeroHpConcentrationBreak`, `effectsMutations.js:1022`):
  dopo il ritorno legge i PF del druido. La concentrazione finisce solo se
  l'eccesso lo porta a 0. È la regola: la forma a 0 non fa cadere il druido.
- **Il TS di concentrazione** **[V]**:
  - CD = max(10, metà del danno), in `concentrationSaveDC`
    (`src/concentrationSaveReminderCore.js:8`);
  - gli avvisi (`concentrationSaveWarningsForItems`, `:120`) saltano solo chi
    ha 0 PF, e dopo il ritorno il druido ne ha di più;
  - il danno viene dagli scrittori, ed è il danno intero: il popup dei PF
    passa `entry.change.requested` (`quick-hp-modal.js:769-771`). Lo stesso
    fanno la console (`bossActionExecution.js:54`), i promemoria
    (`reminderResolution.js:445`) e le aree (`spellAreaResolutionExecutor.js:1148`);
  - l'editor in linea passa il calo dei PF della forma
    (`initiativeEditors.js:571-573`). Va bene: lì non c'è eccesso (G39);
  - il TS usa la Costituzione della forma: lo dà `transformedCardView` (W3b)
    **[D]**, da controllare in W5e dove l'avviso mostra il bonus.

### 5.8 Memoria: ActorVitals e `hpMemory`

**Il rischio più alto, trovato rileggendo** **[V]**:
- `handleItemEvent` (`src/actorVitalsStore.js:597`) salva, a ogni evento dei
  PF, `validCanonicalHP` del token principale del PG (`:647-662`);
- senza un filtro, i PF della bestia diventerebbero i PF del druido nel
  registro;
- l'idratazione (`:480-496`) li scriverebbe poi sul druido nelle altre scene;
- `hpMemory` fa lo stesso per i token senza identità.

Quindi **W5d va nello stesso commit di W5b e W5c**: nessuna forma con i PF
scambiati deve esistere senza il filtro.

**Il filtro, come M0 di CAP-MAXHP.** Una funzione,
`transformationNormalHp(meta)` in `transformationCore.js`, dà lo `stash` se
c'è una forma attiva, altrimenti `{ hp, hpMax }`. Poi `maxHpBaseValues` toglie
i bonus come oggi: Aiuto è sullo `stash` (G33). Va chiamata in:

| Punto | Riga | Cosa fa oggi | Con la forma |
| --- | --- | --- | --- |
| `validCanonicalHP` | `actorVitalsStore.js:91-97` | PF del token senza i bonus delle pill; usata per inizializzare (`:431`, `:443`), confrontare all'idratazione (`:487`), controllare (`:527`, `:552`) e salvare (`:651`) | Lo `stash` senza i bonus |
| `metadataWithCanonicalHP` | `actorVitalsStore.js:131` | Scrive i PF del registro sul token, con i bonus delle sue pill | Su un token trasformato non si usa: vedi G41 |
| `syncHPBatchToMemory` | `hpMemory.js:341` (base a `:386`) | Rilegge il token e salva i PF senza bonus | Lo `stash` senza i bonus |
| `persistRemovedHPItems` | `hpMemory.js:207` (base a `:219`) | Salva i PF di un token rimosso | Lo `stash` senza i bonus |
| `applyHPMemoryToSceneForMissingHP` | `hpMemory.js:483` | Riempie solo i token senza `hp` né `hpMax` (`:531-532`) | Niente: un token trasformato ha i due campi |

**Su una mappa nuova** (G18): il druido arriva con i PF del registro, cioè
quelli della forma normale, e senza la pill. Nessuna modifica.

**Tornando a una mappa vecchia** dove il token ha ancora la pill (G41):
- se il registro e lo `stash` coincidono, l'idratazione non scrive, come oggi;
- se differiscono (il druido è stato ferito o curato altrove),
  l'idratazione chiude la forma con un comando del coordinatore: rimozione
  della pill con il segno e i PF del registro;
- precedente: `hpMemory` chiama già il coordinatore per le condizioni a 0 PF
  (`hpMemory.js:600`);
- non si scrive mai lo `stash` da fuori il coordinatore.

### 5.9 Riposo del gruppo

`src/groupRestCore.js` **[V]**, chiamato da `takeGroupRest`
(`classFeatureRuntime.js:2164`) in un solo comando con la Cronologia.
- `planGroupRestHpWrites` (`:62`): per un membro trasformato il riposo parte
  dallo `stash` (G38):
  - riposo lungo: `hp = stash.hpMax`, con le pill che finiscono contate da
    `planMaxHpChange`, come oggi (`:72-76`);
  - riposo breve: `stash.hp` più i PF recuperati, fino a `stash.hpMax`;
  - la scrittura porta già `maxHpAware` (`:86`) e `hpIntent: { mode: "rest" }`
    (`:87`).
- `groupRestEndingPills` (`:98`): aggiunge la pill della forma, con il segno.
  Così il pianificatore di 5.3 non riscrive lo `stash` sopra il riposo.
- Il riepilogo dice «Forma Selvatica finita», come dice «Aiuto finito».
- Il riposo non tiene conto dei Dadi Vita della forma (G38).

### 5.10 Editor in linea del tracker

`bindHPEditorForEntry` (`src/initiativeList.js:7329`) **[V]**:
- scrive con `updateHP` (`:6168`): un `hp:set` senza intento di danno, dentro
  `withItemMetaHistory` (`:7464`);
- l'istantanea tiene `hp`, `hpMax`, `tempHp`, `tempHpSource`, condizioni,
  incantesimi e concentrazione (`:7476-7484`);
- senza intento, `hpWriteDamageToHp` dà il solo calo dei PF della forma,
  quindi l'eccesso è 0: G18 («niente eccesso») viene da sé;
- un valore a 0 sulla forma la chiude, e il druido torna con lo `stash`
  intero (G39);
- l'Annulla dell'editor rimette anche la pill, perché le condizioni sono
  nell'istantanea;
- **da non toccare:** `initiativeList.js` è fragile (AGENTS.md). In W5e
  cambia solo il testo dell'avviso dopo il salvataggio, nel blocco
  `afterCommit` (`:7499-7520`). Le guardie di `renderAll` non cambiano;
- `applyGroupHPMaxDelta` (`:6916`) e `trySeedGroupHP` (`:5971`) riguardano i
  gruppi di mostri a PF condivisi, già esclusi.

### 5.11 Annulla e Cronologia

**[V]**
- Il coordinatore salva prima e dopo di condizioni, incantesimi e
  concentrazioni (`fields`), e di `hp`, `hpMax` e `tempHp` (`metadataFields`),
  in `applyMetadataPatchesToPlan` (`effectsMutations.js:1039`).
- L'Annulla (`buildHistoryUndoPlan`, `historyUndoCore.js:1830`;
  `processChange`, `:1228`):
  - rimette le istanze delle condizioni una per una;
  - rimette i PF solo se sono ancora quelli scritti, altrimenti rifiuta tutto
    («current-value-mismatch», `:1379`).
- Quindi l'inizio della forma, il ritorno a 0 e la fine tornano indietro
  interi: PF, massimo e pill nello stesso passo. Non serve codice nuovo.
- **Il pannello delle aree** ha il suo ripristino (5.5, punto 3).
- **La taglia** resta fuori dalla Cronologia: la rimette il controllore (G36).
- **Il log del combattimento:** il ritorno e l'inizio vanno in
  `plan.reactionRecords`, come Interdizione e Legame (lotto U3b). Esempi:
  «Forma Selvatica finita: l'eccesso di 5 passa al druido (34 → 29)» e
  «Forma Selvatica: lupo, 11 PF; quelli del druido (34/40) messi da parte».
  Senza la riga, il log leggerebbe «11 → 29» dai PF prima e dopo.

### 5.12 Barre PF, tracker e gioco online

**[V]**
- **Mappa:** `hpbar-items.js` legge `hp` e `hpMax` (`queueCanonicalHPItems`
  `:801`, `mountHPBars` `:850`) e disegna il riempimento in `flushQueued`
  (`:483`).
- **Tracker:** `entryFromSceneItem` (`initiativeList.js:5429`).
- **Il risultato:** con la strada (a) mostrano i PF della forma senza nessuna
  modifica. È G18 («online il giocatore vede i PF della forma»), e le barre
  della mappa e del tracker vengono dagli stessi metadata (AGENTS.md).
- **Visibilità per i giocatori:**
  - `playerView.hp` (`options/optionsDefaults.js:103-119`), proiettata da
    `projectTrackerEntry` (`options/optionsProjection.js:137`) e
    `mapHpDisclosure` (`:177`);
  - non cambia;
  - la riga «PF del druido 34/40» nel dettaglio della pill segue la stessa
    regola dei PF temporanei (CAP-TEMP): solo dove i PF sono esatti.
- **I PF temporanei** restano nel loro campo e nel tratto della barra.

### 5.13 Gli altri scrittori di PF interi

Devono saltare i token con una forma attiva **[V]**:

| Scrittore | Riga | Perché |
| --- | --- | --- |
| Import dei PF da statblock | `monsterHitPointsImportCore.js:36` (salta già i PG, `:48`) | Un mostro trasformato (W7b) riceverebbe i suoi PF sopra quelli della forma |
| Idratazione dal registro (SB3) | `monsterHydrationExtras.js:11` | Lo stesso, entrando nell'iniziativa |
| Collegamento a PF condivisi | `sharedHpCore.js:52` (`planSharedHpLinks`) | Copierebbe i PF della forma agli altri: il collegamento rifiuta un membro trasformato |
| Verifica di stanza (sviluppo) | `fluidityRoomCheck.js:377`, `:710` | Solo sviluppo: niente |

### 5.14 Test e prove di W5

**Test nuovi:**
- `test/transformationCore.test.js`: inizio, ritorno, fine, cambio forma,
  il tetto di Trasformazione, i temporanei che assorbono prima, Aiuto sullo
  `stash`.
- `test/transformationHpIntegration.test.js`, sull'impianto di
  `test/maxHpIntegration.test.js` e `test/reactionHpIntegration.test.js`.
  Druido 34/40 in lupo 11/11:
  1. 15 danni dal popup: druido 30/40, pill finita, una voce di Cronologia;
     l'Annulla rimette lupo 11/11 e la pill;
  2. 84 danni: druido a 0, privo di sensi, tiri contro la morte; 85 danni:
     morto;
  3. Interdizione: 50 danni, druido a 1 PF e interdizione finita; 15 danni,
     interdizione intatta;
  4. 5 PF temporanei e 15 danni: temporanei a 0, lupo 1/11, nessun ritorno;
  5. Aiuto al 2° durante la forma: `stash` 39/45, lupo invariato; alla fine
     della forma druido 39/45;
  6. Palla di fuoco da 28 dal pannello delle aree: druido 17/40; l'Annulla
     del pannello rimette il lupo;
  7. Metamorfosi su un ogre (59 PF): la concentrazione di chi lancia finisce
     e l'ogre torna 59/59;
  8. Legame di Interdizione con chi lancia in forma;
  9. Disintegrazione da 40 sul lupo: druido 5/40, vivo;
  10. editor in linea a 0: druido 34/40;
  11. riposo lungo: forma finita, druido 40/40;
  12. ActorVitals salva lo `stash`; mappa nuova a 34/40; mappa vecchia con la
      pill e registro diverso (G41);
  13. `hpMemory`, token senza identità: salva lo `stash`.
- **Un test di contratto** accanto a
  `test/effectsMutationArchitectureContract.test.js`: ogni scrittore di danno
  dichiara `hpIntent` con l'importo. Oggi lo fanno console, boss, popup,
  promemoria, capacità e incantesimi attivi **[V]**. Uno scrittore senza
  intento perde l'eccesso, come l'editor in linea.
- **Test che cambiano:** `test/druidFeatureRuntime.test.js` (di nuovo),
  `test/groupRestCore.test.js`, `test/actorVitalsStore.test.js`,
  `test/maxHpMemory.test.js`.

**Banco:**
- druido del Circolo della Luna al 6° in orso bruno;
- danni dal popup, dalla console di un goblin e da una Palla di fuoco;
- Annulla, riposo lungo;
- vista compatta e vista espansa, barre sulla mappa.

**Stanza:**
- una voce nuova in `PROVE_IN_STANZA.md`;
- il giocatore online vede i PF della forma;
- cambio di scena: la forma non segue, i PF del druido sì.

## 6. Rischi (AGENTS.md)

AGENTS.md chiede di fermarsi e spiegare il rischio prima di toccare PF, turno,
ordine, barre o metadata. Qui, per area:

**Sincronizzazione dei PF — alto, solo W5.**

| Cosa può andare storto | Effetto al tavolo | Difesa |
| --- | --- | --- |
| Un percorso di danno senza ritorno | Druido a 0 PF della forma, privo di sensi, tiri contro la morte sul massimo della bestia | W5b, W5c e W5d insieme; il test di contratto sugli intenti; un test per percorso (5.14) |
| Doppio ritorno (ritorno a 0 e fine della pill) | Il druido torna con lo `stash` intero e l'eccesso si perde | Il segno `transformationReverted`; test 1 e 6 |
| PF della bestia nel registro | PF sbagliati sul druido nelle altre scene | W5d nello stesso commit; test 12 e 13 |
| Aiuto o Ferire sui PF della forma | Massimo della bestia spostato; alla fine `stash` senza bonus | `planCommandMaxHpWrites` salta i trasformati con un controllo suo, senza toccare `maxHpWritable` (M9); il pianificatore nuovo applica `planMaxHpChange` allo `stash`; test 5 |
| Riposo sui PF della forma | Bestia curata al massimo, druido no | `planGroupRestHpWrites` dallo `stash`; test 11 |
| Import o idratazione di uno statblock su un mostro trasformato | PF del mostro sopra quelli della forma | 5.13 |
| Ordine dei passi nel coordinatore | Interdizione o tiri sulla forma | Il ritorno prima di tutti; test 2 e 3 |

**Turno e ordine dell'iniziativa — nessuno.** Nessun lotto tocca `state.order`,
il turno corrente o le code del turno attivo.
- L'azione bonus della Luna è un dato.
- La durata in ore usa le scadenze che esistono, senza un ticchettio nuovo. Il
  cambio di round passa per più percorsi (AGENTS.md): W6 non li tocca.
- Le forme non si applicano agli id virtuali (Tana, Paragon, Epic) né alle
  modalità boss (§3).

**Barre PF sulla mappa — basso.**
- Le barre derivano già da `meta.hp` e `meta.hpMax`: nessuna modifica al loro
  codice, nessuna larghezza salvata.
- Da guardare in W4b: la barra è un allegato del token. Con la scala cambiata
  deve seguire il token senza essere ricreata. Prova al banco con orso bruno
  (Grande) e ritorno.

**Metadata — medio.**
- Nessun oggetto sostituito intero: la pill entra e esce con le operazioni del
  coordinatore, e i campi del token si fondono.
- Le chiavi `com.thebigpicture.initiative/meta` e `…/state` non cambiano.
- Nessun campo PF nuovo: lo `stash` vive nella pill, come vuole G16.
- **Campi nuovi, non di PF:**
  - `mechanics.transformation` sulla pill;
  - `transformationTokenBefore` sul token (G36);
  - le forme salvate sulla scheda (G37).
- **Dimensione:**
  - un'istantanea pesa qualche KB;
  - la Cronologia salva le condizioni prima e dopo, quindi ogni inizio e ogni
    fine della forma la scrive due volte. È il motivo di un'istantanea
    compatta e del limite di 8 forme salvate;
  - misure di riferimento del 24/10: History di 206 KB in scena. Con ARCH-009
    History e journal stanno in IndexedDB.

**Cicli di metadata — medio, W4b e G41.**
- Il controllore della taglia scrive un token quando vede la pill sparita.
  - Gira solo nel background del GM.
  - Scrive solo se la scala differisce, e cancella il campo nella stessa
    scrittura: una seconda passata non trova niente da fare.
- L'idratazione di un token trasformato (G41) passa dal coordinatore, con un
  solo comando; non c'è un ascoltatore nuovo sui PF.

**Zone fragili:**
- `initiativeList.js`: solo il testo dell'avviso in `afterCommit` (5.10), e la
  CA della card in W3b. Nessuna guardia di `renderAll` cambia.
- `pc-attack.js` e `pcAttackCore.js`: in lavorazione per T6. W3 va dopo, o
  d'accordo con quella sessione.
- `effectsMutations.js` e `spellAreaResolutionExecutor.js`: solo i punti del
  §5, con i test.

**Regole:** solo PHB 2014 e Xanathar o Tasha dove servono, mai 2024. Gli
statblock 2024 dell'archivio restano fuori dall'elenco delle forme (W1).

## 7. Decisioni per l'utente

Le decisioni G15–G18 restano come approvate. Le nuove partono da G24.

**Esito:** il 16/11 l'utente le ha approvate tutte («Approvo tutto»). La
colonna «Raccomandazione» è quindi la decisione presa. G37 ha un'aggiunta
dell'utente: il comando «Altra forma…» (W2a).

| # | Lotto | Domanda | Raccomandazione |
| --- | --- | --- | --- |
| G24 | W1 | Una sola primitiva (pill con `mechanics.transformation`, modulo `transformationCore.js`) per druido e incantesimi? | Sì |
| G25 | W2, W7 | Chi riceve i PF della forma? | Ogni creatura con PF tracciati, mostri compresi. PF condivisi, token d'incantesimo e modalità boss: pill come etichetta, con il motivo |
| G26 | W3 | TS e caratteristiche nella forma: calcolati? | Sì. Forma Selvatica, Trasformazione e Forme Animali: mente del PG; TS fisici della bestia, con la competenza del PG se ce l'ha, e vince il bonus più alto. Metamorfosi e Metamorfosi Pura: tutto della forma |
| G27 | W3 | Le difese della forma si uniscono a quelle del PG? | Sì, per tutte le fonti nel primo giro. A rigore Metamorfosi toglie anche quelle della specie: la sostituzione si fa in W7b solo se il gruppo usa Metamorfosi sui PG |
| G28 | W2, W7 | Cambiare forma mentre si è già trasformati? | Forma Selvatica: un uso nuovo, i PF della forma nuova, lo `stash` resta quello della forma normale. Trasformazione: con un'azione, i PF non salgono sopra gli attuali. Forme Animali: con l'azione di chi lancia |
| G29 | W3 | Gli incantesimi in forma bestiale | La console li nasconde fino a Incantesimi Bestiali. Il pannello degli incantesimi del tracker mostra un avviso, senza bloccare |
| G30 | W7c | Metamorfosi Pura che diventa permanente | Un pulsante «Rendi permanente» sulla pill, a mano: toglie concentrazione e scadenza. **Scartato il 16/11** dall'utente: resta al tavolo |
| G31 | W7c | Oggetto in creatura e creatura in oggetto | Fuori: resta l'etichetta |
| G32 | W7e | Metamorfosi di Massa (con i PF temporanei di CAP-TEMP) e Impulso 77–78 (la pecora) | Sì, per ultimi. Prima si verifica il testo di Xanathar, che nel repository manca |
| G33 | W5 | Gli effetti sul massimo (Aiuto, Ferire, Banchetto) durante la forma | Tutti sulla forma normale, cioè sullo `stash`, come Aiuto in G18. Il dettaglio della pill lo dice |
| G34 | W5 | Interdizione alla Morte su una forma che scende a 0 | Guarda i PF veri, dopo il ritorno: scatta solo se l'eccesso porta la creatura a 0 |
| G35 | W5 | Il ritorno nelle anteprime | Una riga «Torna normale: PF 34 → 29» nell'anteprima del pannello unificato e della console. Il resto resta com'è |
| G36 | W4 | La taglia del token alla fine della forma | La scala di prima in un campo del token (`transformationTokenBefore`). Un controllore nel background del GM la rimette quando la pill non c'è più, anche dopo un Annulla, con una sola scrittura per token |
| G37 | W2 | Forme salvate sulla scheda del druido, per sceglierle anche online | Sì. Al massimo 8 istantanee compatte, che il GM riempie dall'archivio o da JSON e testo. **Aggiunta dell'utente:** il comando «Altra forma…» importa una forma che non è tra le 8, da usare una volta o da salvare |
| G38 | W5 | Il riposo del gruppo con un druido in forma | Riposo breve e lungo chiudono la forma prima di curare. I Dadi Vita della forma non si contano |
| G39 | W5 | L'editor in linea che porta la forma a 0 (G18: niente eccesso) | La forma finisce e tornano i PF del druido interi, con un avviso. Il danno con l'eccesso passa dal popup dei PF |
| G40 | W5 | Disintegrazione e Dito della morte su una forma | Contano sulla forma normale: a 0 PF della forma la creatura torna normale con l'eccesso, e muore solo se arriva a 0 nella sua forma vera |
| G41 | W5 | Tornando a una mappa dove il token ha ancora la pill, e il druido è stato ferito o curato altrove | L'idratazione chiude la forma e scrive i PF del registro, con un comando del coordinatore. Se nulla è cambiato, la forma resta |

**Cosa serve per partire:** le decisioni ci sono tutte. Resta il via
dell'utente su ogni lotto, come per gli altri studi; per W5 è il via a
scrivere i PF secondo il §5.

## 8. Ordine consigliato e metodo

**Ordine:**
1. W1, codice puro.
2. W2a: il campo «Forma» della console, le forme rapide e «Altra forma…»
   (G37).
3. W3a e W3b, dopo il commit di T6 sulle azioni di turno.
4. W4a, poi W4b con il controllore della taglia (G36).
5. Prova in stanza di W1–W4: un druido in forma, PF ancora a mano.
6. W5a, poi W5b, W5c e W5d in un solo commit, poi W5e; push solo a W5
   intero. Prima di W5b, via esplicito dell'utente.
7. W6.
8. W7a, W7b (con W3c), W7c, W7d, W7e.

**Metodo:**
- Codice letto il 16/11/2026 su `main` (`9ba15942`), con le modifiche non
  committate di altre sessioni nella cartella.
- Ricontrollati nel codice:
  - `calculateQuickHPChange`;
  - i blocchi PF del coordinatore, i suoi pianificatori dei temporanei e del
    massimo;
  - le tre Interdizioni;
  - il pannello delle aree (`updateHP`, `restoreHPIfUnchanged`,
    `planAreaDeathSaves`);
  - la velocità (`baseModeSources`), le difese delle pill, le azioni concesse;
  - memoria, riposo, Annulla, barre, editor in linea e concentrazione: mappati
    da una ricerca in parallelo, poi ricontrollati nei punti citati.
- Testi degli incantesimi da `src/spell-reference-it.json` (2014). Forma
  Selvatica e Circolo della Luna: PHB 2014, pp. 66–69, riassunti nello studio.
- Metamorfosi di Massa: testo non presente nel repository, **[D]**.
- Commit e bundle solo su richiesta, con i soli file del lotto.
