# Studio: talenti

Data: 15 novembre 2026. Stato: **studio, decisioni D1–D15 approvate
dall'utente il 15/11** (§9); **F0 fatto il 15/11** (§7.1).
Base dello studio: `main` locale a `12fb9bb3` (T1 delle azioni di turno), tre
commit davanti a `origin/main` (`09adef5d`); F0 è provato su `8641fd03`.

Richiesta (15/11): i talenti sono l'unico buco vero del plugin. La
raccomandazione data con lo studio delle azioni di turno è di studiarli subito e
di implementarli dopo i lotti base di quello studio, perché diversi talenti si
agganciano alle azioni.

Indicazione dell'utente durante lo studio (15/11): «Dobbiamo studiare i talenti
da PHB, XGE e TCE, non dai personaggi singoli». Quindi:

- il perimetro sono i tre manuali (§2);
- l'ordine dei lotti viene dal guadagno di automazione, non dai talenti dei PG
  della tavola (§7).

Vincoli:

- regole PHB 2014;
- **niente bookkeeping del GM**: l'economia d'azione è stata scartata il 23/10.
  Un talento entra solo se il plugin lavora al posto del GM;
- niente funzioni per un solo mostro;
- si automatizzano conti, PF e spostamenti; ciò che al tavolo è sociale o
  facile resta pill o testo;
- il repository GitHub è pubblico: nessun testo dei manuali fuori dall'SRD;
- le prove valgono in vista compatta ed estesa.

---

## 1. Che cosa esiste già

### 1.1 Nessun catalogo, solo promemoria

- Non esiste un catalogo dei talenti, né un campo della scheda che li tenga.
- «Talento» compare solo come card passiva di due specie: Umano variante
  (`speciesTraitCore.js:745-746`) e Lignaggio personalizzato
  (`speciesCatalogTasha.js:12`). Il testo dice che gli effetti «si configurano a
  parte: capacità, Azioni rapide, difese».
- Alcuni commenti del codice prevedono già i talenti:
  - le azioni rapide con usi propri (`quickActionsCore.js:221`,
    `spellSlotSpendCore.js:93`, `quickActionSpellExecutionCore.js:60`);
  - il trucchetto da talento negli attacchi (`pcAttackPickerCore.js:87`);
  - il libro (`spellbookCore.js:4`) e i rituali, «un talento come Incantatore
    Rituale» (`spellbookCatalog.js:126-128`).
- Gli studi precedenti rimandano a questo:
  - `STUDIO_AVVISI_REAZIONE.md`, D8: i talenti con reazione diventano voci
    scelte nella scheda, dopo R3, con un campo della scheda in fusione
    (riga 354);
  - `STUDIO_AZIONI_DI_TURNO.md`, A7: Mobile, Sentinella, Furtivo, Lottatore e
    Maestro degli scudi restano fuori perché manca un catalogo.

### 1.2 L'import della scheda

- `parseCharacterSheetImport` (`characterSheetImportCore.js:421-457`) legge le
  sezioni di `SHEET_IMPORT_SECTIONS` (righe 21-36).
- Una chiave `feats` **si perde in silenzio**: non diventa una sezione e non
  finisce tra i nomi non riconosciuti (righe 437-450).
- `docs/IMPORT_SCHEDA.md`:
  - riga 72: il trucchetto «da una specie o da un talento» va negli attacchi,
    con `source: { kind: "cantrip", spellIds }`;
  - righe 75-76: gli incantesimi concessi da talenti, specie o oggetti vanno
    nelle **Azioni rapide**;
  - il prompt per l'assistente li esclude da `spells` (righe 96-97).
- La stessa regola è scritta sotto il libro della scheda
  (`initiative-card-modal.html:566`).

### 1.3 Il modello da riusare: tratti di specie e doni

- **La forma.** I tratti di specie hanno la forma dei record delle capacità di
  classe (`speciesTrait`, `speciesTraitCore.js:654-706`):
  - id `specie-<specie>-<chiave>`, `classId` vuoto, `collection: "tratti-specie"`;
  - attivazione, pool, `effectPlan`;
  - i campi facoltativi che i sottosistemi leggono: `innateSpell`, `hpTrait`,
    `breath`, `naturalWeapon`, `speciesSave`, `endsOnAttack`.
- **I pool** stanno in `SPECIES_RESOURCE_POOLS` (`speciesTraitCore.js:503-521`).
- **La risoluzione.** I tratti si risolvono per id insieme alle capacità
  (`classFeatureCatalog.js:35-44`). `getEnabledClassFeatures` li mette in coda
  (`classFeatureCatalog.js:129-146`, riga 145), con `getSpeciesFeatures`
  (righe 149-153) e `speciesFeaturesForProfile` (`speciesTraitCore.js:807-817`).
- **Una terza fonte esiste già:** il dono soprannaturale, campo
  `supernaturalGift`, id `dono-…` (`speciesTraitCore.js:27`,
  `initiativeCards.js:117-121, 184-191`). È il modello più vicino ai talenti.

Da `getEnabledClassFeatures` dipendono già, con il solo id:

| Che cosa | Dove |
|---|---|
| Extra al colpo della console | `pcAttackRidersForCard`, `pcAttackRiderCatalog.js:210` |
| Attivazioni della console | `pcAttackActivationsForCard`, `pcAttackActivationCatalog.js:190-198` |
| Reazioni delle capacità | `enabledReactionFeature`, `reactionCandidatesCore.js:152`, usata alla riga 285 |
| Velocità passive | `movementProfileItemCore.js:12-27` |
| Tab Capacità della scheda | `renderClassFeatures`, `initiative-card-modal.js:2800` |
| Menu della card | `buildClassFeatureContextEntries`, `classFeatureCatalog.js:235-278` |

Quattro punti invece elencano a mano classi e specie, e non vedrebbero i
talenti:

| Punto | Che cosa fa | Dove |
|---|---|---|
| `characterResourcePools` | i pool che il riposo ripristina | `classFeatureRuntime.js:2103-2106` |
| `classFeaturePassiveProfile` | le difese passive delle capacità: legge solo `CLASS_FEATURES` | `damageDefensesCore.js:99-118`, riga 102 |
| `creatureCastableSpellIds` | gli incantesimi che una creatura può lanciare: libro, azioni rapide, innati di specie | `attackReactionsCore.js:48-61` |
| `speciesInnateSpellCore.js` | tratti e pool delle sole specie | righe 18-19 |

### 1.4 La scheda

- **Dove vive.** `initiativeCard` sta sul token, nei metadata
  `com.thebigpicture.initiative/meta`. Una copia va nel registro della stanza
  (`…/initiativeCards`) e una nel browser del GM.
- **Il registro della stanza** ha 4.450 byte (`roomMetadataBudget.js:16`), con
  la compressione di `initiativeCardRegistryCore.js:110-142`.
- **I campi facoltativi** si scrivono solo se presenti (`Object.hasOwn`):
  - `sanitizeInitiativeCard`, `initiativeCards.js:90-129`;
  - `mergeProfile`, righe 138-202;
  - `INITIATIVE_CARD_KNOWN_FIELDS`, righe 251-274;
  - `hasInitiativeCardValues`, riga 827.
- **Caratteristiche e TS.** La scheda tiene solo i modificatori
  (`abilityModifiersCore.js:4-33`), non i punteggi. I tiri salvezza sono totali
  (`initiativeCards.js:107-109`). Non c'è un bonus d'iniziativa.
- **Il modale.**
  - Le tab sono Statistiche, Incantesimi, Azioni rapide, Attacchi e Capacità
    (`initiative-card-modal.html:441-455`).
  - In modifica la tab Capacità ha Specie, Classi e livelli e Capacità attive
    (righe 595-613).
  - L'editor della specie è `buildSpeciesEditor`
    (`initiative-card-modal.js:4973-4993`). Al salvataggio ogni campo si scrive
    solo se usato o già presente (righe 5309-5323).

### 1.5 I testi sono già nei pacchetti privati

Con i lotti P5, P7 e P8 del compendio (`PIANO_COMPENDIO_REGOLE_FASE_2.md`) i
testi dei talenti sono entrati nei pacchetti come **voci di regole**
dell'Enciclopedia DM, nell'argomento Personaggio:

| Pacchetto | Sezione | Voci | Pagine |
|---|---|---|---|
| PHB | `phb-talenti-manuale` | introduzione e 42 talenti, da `phb-abile` a `phb-tiratore-scelto` | 165–170 |
| XGE | `xge-talenti-razziali` | introduzione con la tabella e 15 talenti | 73–75 |
| TCE | `tce-talenti-tasha` | introduzione e 14 talenti | 79–81 |

- **Manca Cuoco** (Chef). Nell'OCR il suo titolo è in minuscolo, quindi il suo
  testo è finito in coda a `tce-contaminazione-ombrosa`. Verificato: quella voce
  contiene «Cuoco» e «cucinare».
  - Si corregge nell'indice privato di Tasha
    (`sorgenti/regole/tasha-bozza-indice.cjs`);
  - poi `npm run generate:private-rules -- --book=tasha` e `npm run packs:build`.
- **Chi legge che cosa.**
  - Il testo di una capacità si cerca nei pacchetti per id, in
    `pack.classFeatures` (`classFeatureDescriptions.js:17`).
  - Le voci di regole le legge solo l'Enciclopedia (`reference-modal.js:296,
    317`, con `mergeRulesCatalogs`).
- **L'SRD 5.1** italiano ha un solo talento, Lottatore. Il compendio del
  repository non lo contiene: in `src/rules-reference-it.json` non c'è una voce
  dei talenti e l'indice `scripts/srd-rules-outline-it.json` non ha la sezione.

### 1.6 I sottosistemi, visti da un talento

| Sottosistema | Che cosa c'è | Che cosa manca per un talento |
|---|---|---|
| **Console attacchi** | Extra al colpo `PC_ATTACK_RIDERS` (`pcAttackRiderCatalog.js:28`). Attivazioni `PC_ATTACK_ACTIVATIONS` (`pcAttackActivationCatalog.js:48`, campi alle righe 14-25). Seguiti `pcAttackFollowUps` (`pcAttackCore.js:866`). Limite per turno (`currentRiderUses`, riga 590). `requires.damageType` per le attivazioni (riga 791). | La console non valuta formule e non controlla le proprietà delle armi (`pcAttackCore.js:2-3`). I dadi per livello leggono il livello della classe del record (`pcAttackRiderCatalog.js:174-176`): un talento ha solo dadi fissi, bonus di competenza, livello totale o caratteristica. Un bonus al tiro negativo diventa «+-5» (`pcAttackActivationRollBonus`, `pcAttackActivationCatalog.js:289-293`). Non si ritirano i dadi di danno. |
| **Difese ai danni** | `profileDamageDefenses` (`damageDefensesCore.js:137`) unisce scheda, specie e capacità passive. ✦ Magica supera le difese non magiche (`pcAttackMagicIgnoredDefenses`, `pcAttackCore.js:1102`). | Una fonte «talento» (riga 102 legge solo `CLASS_FEATURES`). Una riduzione fissa passiva: oggi `reduce` esiste solo per le reazioni (`normalizeDamageReactions`, `damageReactionCore.js:44`). Ignorare solo la resistenza: `ignoredTypes` toglie l'intera difesa (`damageDefensesCore.js:218`, `spellDamageDefenseCore.js:97`). Il precedente giusto è `bossMarkedDefenses` (`bossActionExecutionCore.js:282`). |
| **PF massimi** | CAP-MAXHP legge i bonus solo dalle pill (`maxHpModifierCore.js:18-43`, `maxHpEffectForCast` alla riga 106). La regola M0 (`PIANO_CAP_MAXHP.md` §3): la memoria tiene il PG senza gli effetti in corso. | I PF massimi di un PG li scrive il GM; nessun comando li ricalcola dalla scheda. Robustezza nanica è una card di riferimento (`speciesTraitCore.js:712-713`). |
| **PF temporanei e cure** | `activateClassFeature` scrive una patch per bersaglio in un solo comando (`classFeatureRuntime.js:1410`). `classFeatureTemporaryHpApplications` (`classFeatureCore.js:1459`). Gli importi delle specie vanno per livello totale o bonus di competenza (`SPECIES_HP_TRAITS`, `speciesTraitCore.js:479-492`). | Un importo «livello totale + caratteristica»: quello delle capacità vuole una classe (`classFeatureTemporaryHpAmount`, `classFeatureCore.js:1430-1450`, null alla riga 1440). |
| **Concentrazione** | `buildConcentrationSaveWarning` (`concentrationSaveReminderCore.js:37`) con la CD (riga 8). | Nessun vantaggio o svantaggio. Le modifiche passano solo con l'id e il danno (`concentrationDamageByItemId`, riga 107): non si sa chi ha inflitto il danno. |
| **Reazioni** | Catalogo (`reactionTriggerCatalog.js`, campi alle righe 5-29, inneschi e flussi alle righe 31-34), candidati (`reactionCandidatesCore.js:280-297`), lotti attivi (`REACTION_PROMPT_LOTS`, `reactionPromptView.js:17`). | Il catalogo controlla solo `spell`, `class-feature` e `monster`: un `source: "feat"` verrebbe offerto **a ogni creatura**. |
| **Movimento** | `passiveMechanics.movement.addMeters` (`classFeatureCore.js:110-119`) diventa una pill virtuale (`movementProfileItemCore.js:12-27`). Il terreno difficile si può ignorare (`movementProfileCore.js:127, 261, 335`). Gli avvisi di AdO (`movementReactionEvents`, `opportunityAttackCore.js:50-80`) rispettano Disimpegno (righe 15 e 34). | Il terreno difficile ignorato solo con uno Scatto. Un'esclusione degli AdO per singolo reattore. |
| **Iniziativa** | Il GM scrive il numero (`initiativeEditors.js:24-32`). | Un bonus d'iniziativa. La sorpresa non esiste. |
| **Incantesimi concessi** | Il modello delle specie: azione `species-spell:<tratto>` (`speciesInnateSpellCore.js:16`), CD 8 + competenza + caratteristica (righe 56-60), uso speso nel comando del lancio (riga 114), apertura nel pannello (`spell-unified-panel.js:477`). Il gruppo `granted` del libro (`spellbookGroups`, `spellbookCatalog.js:165-179`). Le azioni rapide con usi propri, al riposo lungo (`quickActionsCore.js:235, 354-365`). | Un modulo che accetti anche i talenti. Gli incantesimi del catalogo non hanno le liste di classe: c'è solo livello e scuola. «Dalla lista del mago» non si può controllare. |
| **Azioni di turno** | T1 fatto in `12fb9bb3`: scheda Azioni con Scatto, Disimpegno, Schivata, Lotta e Spinta (`pcAttackTurnActionCore.js:21`); promemoria sotto il bersaglio (`pcAttackTargetNotes`, riga 122). Le prese sono note (`pcGrappleHolds`, `pcAttackManeuverCore.js:56`). | T2 (Aiuto, Nascondersi), T3 (Preparare) e T4 (capacità con azioni bonus) non sono fatti. |

---

## 2. Il perimetro

**72 talenti**, dai tre manuali indicati dall'utente:

| Manuale | Talenti | Mezzi talenti (+1) | Pagine | Nel pacchetto |
|---|---:|---:|---|---|
| Manuale del Giocatore 2014 | 42 | 13 | 165–170 | 42 voci |
| Xanathar | 15, tutti razziali | 11 | 73–75 | 15 voci |
| Tasha | 15 | 10 | 79–81 | 14 voci: manca Cuoco (§1.5) |

**Mezzi talenti**, cioè quelli che aumentano di 1 una caratteristica:

- PHB: Atleta, Attore, Corazze Leggere, Corazze Medie, Corazze Pesanti, Lottatore
  da Taverna, Maestro d'Armi, Maestro delle Armature Pesanti, Mente Acuta,
  Linguista, Osservatore, Resiliente, Tenace;
- XGE: tutti tranne Alta Magia Drow, Fortuna Generosa, Magia degli Elfi dei
  Boschi e Prodigio;
- TCE: Abilità Impeccabile, Bisturi da Battaglia, Contaminazione Fatata,
  Contaminazione Ombrosa, Cuoco, Martello Vivente, Pistolero, Stile Penetrante,
  Telecinesi, Telepatia.

**Ripetibile:** solo Adepto Elementale, con un tipo di danno diverso ogni volta.

**Talenti razziali** di Xanathar, ognuno legato a una specie del PHB:

| Talento | Specie |
|---|---|
| Agilità Tarchiata | nano o una specie di taglia Piccola |
| Alta Magia Drow | elfo drow |
| Costituzione Infernale, Fiamme di Flegesto | tiefling |
| Fortuna Generosa, Seconda Possibilità | halfling |
| Furia Orchesca | mezzorco |
| Magia degli Elfi dei Boschi | elfo dei boschi |
| Paura Draconica, Pelle di Drago | dragonide |
| Precisione Elfica | elfo o mezzelfo |
| Prodigio | mezzelfo, mezzorco o umano |
| Scomparire | gnomo |
| Teletrasporto Fatato | alto elfo |
| Tempra Nanica | nano |

**I nomi italiani** sono quelli dei manuali, e diversi da quelli usati finora
negli studi. Per esempio:

- Mobile è **Mobilità**;
- Skulker è **Appostato**;
- Mage Slayer è **Sterminatore di Maghi**, non «Mago assassino» come in
  `STUDIO_AVVISI_REAZIONE.md`;
- Inspiring Leader è **Condottiero Ispiratore**;
- Great Weapon Master è **Maestro d'Armi Possenti**;
- Fey Touched è **Contaminazione Fatata**.

Il catalogo tiene il nome inglese come alias, per l'import.

**Fuori perimetro**, su indicazione dell'utente:

- i talenti degli altri libri dei cataloghi di specie: Fizban (i tre doni dei
  draghi), Eberron (Marchio del Drago Aberrante), Strixhaven (due) e Dragonlance
  (sei). Il modello li accoglie dopo, con la stessa forma;
- i talenti delle regole 2024.

---

## 3. I testi

### 3.1 Che cosa resta nel repository

Solo ciò che serve a far lavorare il plugin:

- id, nome italiano, alias inglesi, libro e pagina;
- il prerequisito in poche parole: «Forza 13», «nano o specie Piccola»;
- le caratteristiche del mezzo talento e le scelte da fare (§4.2);
- i campi di automazione dei lotti: pool, extra, movimento, incantesimi;
- una riga **«Nel plugin»** scritta per il plugin. Dice che cosa calcola il
  plugin, non che cosa dice la regola. Per esempio «+3 m nel tracker
  movimento», oppure «solo riferimento: gestito al tavolo».

**Lottatore** è SRD: il suo testo entra nel compendio pubblico. Si aggiunge la
sezione dei talenti dell'SRD all'indice (`scripts/srd-rules-outline-it.json`),
poi si rigenera `src/rules-reference-it.json`, con l'attribuzione SRD.

### 3.2 Che cosa resta nei pacchetti

- **I testi, che ci sono già** (§1.5). Ogni record di talento porta l'id della
  sua voce, `rulesEntryId`: `phb-robusto`, `xge-agilita-tarchiata`,
  `tce-telecinesi`.
- **La scheda** mostra il testo di quella voce dal pacchetto importato. Senza
  il pacchetto mostra la riga «Nel plugin» e la nota di oggi
  (`privateTextMissingNote`, `privatePackCore.js`): «Il testo è nel pacchetto
  privato «Manuale del Giocatore»: importalo dall'Enciclopedia DM (Pacchetti).»
- **Non cambiano** né il formato dei pacchetti (`validatePrivatePack`,
  `privatePackCore.js:71`) né `build-private-packs.mjs`.

### 3.3 Le strade scartate

- **Un riassunto per talento, come per le specie.** I tratti delle specie sono
  riassunti scritti per il plugin. Per i talenti i testi esistono già nei
  pacchetti: 72 parafrasi in un repository pubblico costerebbero lavoro e
  sarebbero troppo vicine al libro.
- **Copiare i testi in `classFeatures` dei pacchetti**, con gli id `talento-…`.
  La scheda li troverebbe da sola (`classFeatureDescriptions.js:17`). Però
  duplica i testi e chiede di cambiare i generatori privati.

### 3.4 I controlli

- `npm run check:private-texts` e `test/privateTextGuard.test.js` tengono i testi
  fuori dal repository: il catalogo dei talenti deve passarli.
- Un test controlla che ogni `rulesEntryId` esista nel pacchetto. Gira solo con
  la cartella privata, e si salta nella CI come gli altri test dei testi.

---

## 4. Modello e interfaccia

### 4.1 Il catalogo

Un modulo puro, per esempio `src/featCatalog.js`, senza testi. Ogni talento è un
record con la forma delle capacità, come i tratti di specie:

- id `talento-<slug>` dal nome italiano: `talento-robusto`,
  `talento-maestro-d-armi-possenti`;
- `classId` vuoto, `featId`, `collection: "talenti"`, `defaultEnabled: true`;
- `source` con gli id dei pacchetti (`phb2014`, `xanathar`, `tasha`),
  `sourceLabel`, `page` e `rulesEntryId`;
- `aliases`, `prerequisite`, `speciesIds` per i talenti razziali,
  `abilityChoices` per i mezzi talenti, `choices` (§4.2), `repeatable`;
- attivazione, pool e i campi dei sottosistemi, aggiunti lotto per lotto.

Un talento con più usi diventa più record, come «Magia drow: Luminescenza» per
la specie. Per esempio `talento-contaminazione-fatata-passo-velato` e
`talento-contaminazione-fatata-incantesimo`.

I pool stanno in `FEAT_RESOURCE_POOLS`, con id `talento-<slug>-<chiave>-usi`:

| Pool | Capienza | Ricarica |
|---|---|---|
| Fortunato | 3 punti | riposo lungo |
| Adepto Marziale | 1 dado d6 | riposo breve o lungo |
| Adepto di Metamagia | 2 punti | riposo lungo |
| Furia Orchesca, Seconda Possibilità, Teletrasporto Fatato, Scomparire | 1 | riposo breve o lungo |
| Ogni incantesimo gratuito di un talento | 1 | riposo lungo |
| Delizie di Cuoco | bonus di competenza | riposo lungo |

Seconda Possibilità si ricarica anche quando si tira l'iniziativa. Il plugin
conosce solo i riposi come eventi: quella ricarica resta al GM.

**Dove si aggancia:**

- `featFeaturesForProfile(profile)` va in coda a `getEnabledClassFeatures`,
  dopo le specie (`classFeatureCatalog.js:145`);
- i record vanno in `CLASS_FEATURE_BY_ID` e i pool nella mappa dei pool
  (righe 37-44);
- i pool vanno anche in `characterResourcePools`
  (`classFeatureRuntime.js:2106`), così il riposo li ripristina;
- i record restano fuori da `CLASS_FEATURES`, come le specie: l'editor delle
  classi e gli audit del catalogo non li elencano.

### 4.2 Le scelte

Le scelte di un talento si salvano con il talento. Solo quelle che il plugin usa:

| Scelta | Talenti |
|---|---|
| Caratteristica | i mezzi talenti con più opzioni. Serve davvero solo dove fa da caratteristica da incantatore o da CD: Contaminazione Fatata, Contaminazione Ombrosa, Telecinesi, Telepatia, Paura Draconica |
| Tipo di danno | Adepto Elementale |
| Classe | Iniziato alla Magia, Incantatore Rituale, Cecchino Magico |
| Incantesimi | Iniziato alla Magia, Contaminazione Fatata, Contaminazione Ombrosa, Rudimenti da Artefice, Magia degli Elfi dei Boschi, Cecchino Magico, Incantatore Rituale |
| Manovre | Adepto Marziale |
| Opzioni di metamagia | Adepto di Metamagia |
| Supplica, stile di combattimento | Adepto Occulto, Rudimenti da Guerriero |
| Arma con portata | Maestro delle Armi su Asta: «portata 3 m», perché il plugin non conosce la portata delle armi dei PG |

Restano fuori le scelte che vivono nella scheda: abilità, strumenti, lingue,
armi.

### 4.3 Il campo della scheda

`initiativeCard.feats`, un elenco di `{ id, ability?, choice? }`:

```json
"feats": [
  { "id": "robusto" },
  { "id": "adepto-elementale", "choice": { "damageType": "fire" } },
  { "id": "contaminazione-fatata", "ability": "cha", "choice": { "spellIds": ["hex"] } }
]
```

- **Come gli altri campi facoltativi:** si scrive solo se usato o già presente,
  e passa da `sanitizeInitiativeCard`, `mergeProfile`,
  `INITIATIVE_CARD_KNOWN_FIELDS` e `hasInitiativeCardValues` (§1.4).
- **La pulizia** controlla la forma, non il catalogo. Un id che questa versione
  non conosce resta nel campo, in rosso nell'editor, senza produrre capacità.
  Così un client più vecchio non cancella i talenti di uno più nuovo.
- **Il peso:** da 15 a 60 byte per talento prima della compressione. Va misurato
  con `encodeInitiativeCardRegistryForRoom`, su un gruppo di cinque PG.

### 4.4 Mezzi talenti e Resiliente

- **Il +1 non si applica.** La scheda tiene i modificatori, non i punteggi
  (§1.4), e i modificatori della scheda contengono già il +1. Senza il
  punteggio il plugin non saprebbe se il +1 cambia il modificatore.
- **Resiliente** dà la competenza in un TS, che è già nel totale della scheda.
- La caratteristica scelta si salva comunque, perché la scheda la mostra e
  alcuni talenti la usano (§4.2).

### 4.5 La scheda nel modale

**In modifica**, nella tab Capacità (`initiative-card-modal.html:595-613`):

- un riquadro **Talenti** fra Specie e Classi e livelli;
- una riga per talento: un menu a tendina raggruppato per manuale, come quello
  delle specie (`buildSpeciesEditor`, `initiative-card-modal.js:4973-4993`), e
  una ✕; sotto, un pulsante **+ Talento**;
- sotto ogni riga compaiono solo le scelte di quel talento. Gli incantesimi si
  scelgono come nel libro, filtrati per livello e scuola;
- **avvisi, non blocchi:**
  - un talento razziale su un'altra specie («Agilità Tarchiata: per nani e
    specie Piccole»);
  - lo stesso talento due volte, tranne Adepto Elementale con un altro tipo;
  - un incantesimo di livello o scuola sbagliati.

  Le liste di classe restano al GM: il plugin non le ha.
- Umano variante e Lignaggio personalizzato: la loro card «Talento» dirà
  «sceglilo nella sezione Talenti». L'editor non obbliga a sceglierlo.

**In lettura:**

- in cima alla tab, accanto ai badge di specie e classi (`renderClassFeatures`,
  `initiative-card-modal.js:2807-2820`), un badge per talento: «Robusto»,
  «Adepto Elementale · fuoco»;
- i record dei talenti compaiono in Capacità abilitate, Risorse e Attive, come i
  tratti di specie, con il testo del pacchetto o la riga «Nel plugin»;
- il menu della card riceve da solo i talenti con un uso
  (`buildClassFeatureContextEntries`): `initiativeList.js` non si tocca;
- nel libro della scheda gli incantesimi concessi compaiono con la fonte
  «Talento: Contaminazione Fatata» (`spellbookGroups`, il campo `granted`).

### 4.6 L'import JSON e la sua documentazione

- **Una sezione nuova**, «Talenti», in `SHEET_IMPORT_SECTIONS`, dopo la specie.
  Come classi e specie, l'elenco importato sostituisce quello della scheda.
- **Il formato:**

  ```json
  "feats": [
    "Robusto",
    "Great Weapon Master",
    { "name": "Adepto Elementale", "damageType": "fuoco" },
    { "name": "Fey Touched", "ability": "cha", "spells": ["Sortilegio"] },
    { "name": "Magic Initiate", "class": "wizard", "cantrips": ["Dardo di fuoco", "Mano magica"], "spell": "Scudo" }
  ]
  ```

  - nomi in italiano o in inglese, accettata anche la chiave `talenti`;
  - un nome sconosciuto va in rosso, mai indovinato;
  - il riepilogo del pannello: «4 talenti: Robusto, Maestro d'Armi Possenti…».
- **`docs/IMPORT_SCHEDA.md`:**
  - una riga nella tabella delle chiavi e la chiave nell'esempio;
  - il prompt per l'assistente chiede `feats` con le scelte;
  - la frase delle righe 75-76 cambia: gli incantesimi dei talenti arrivano con
    il talento, non in `spells` né nelle Azioni rapide. Quelli di specie e
    oggetti restano come oggi.

### 4.7 Le azioni rapide già create a mano

Oggi la regola manda gli incantesimi dei talenti nelle Azioni rapide. Quando la
scheda ha un talento che concede lo stesso incantesimo, e un'azione rapida con
«Usi propri» per quell'incantesimo:

- l'editor la segnala come doppione e propone di toglierla;
- non la toglie da solo (D7).

---

## 5. Mappa dell'automazione

Legenda della colonna «Livello»:

- **Auto**: il plugin calcola o scrive;
- **Prom.**: un promemoria al momento giusto, senza clic;
- **Risorsa**: usi contati e ripristinati al riposo;
- **Testo**: solo la card.

### 5.1 Manuale del Giocatore (42)

| Talento | Inglese | Che cosa fa il plugin | Livello | Lotto |
|---|---|---|---|---|
| Abile | Skilled | competenze nella scheda | Testo | F0 |
| Adepto Elementale | Elemental Adept | gli incantesimi del talentuoso ignorano la resistenza al tipo scelto, non l'immunità; «gli 1 ai dadi contano 2» come promemoria | Auto, Prom. | F7 |
| Adepto Marziale | Martial Adept | le due manovre scelte nella console, come quelle del Maestro di Battaglia, con un d6 suo | Auto, Risorsa | F9 |
| Aggressore Selvaggio | Savage Attacker | «ritira i dadi dell'arma, una volta per turno» al primo colpo in mischia del turno | Prom. | F1 |
| Allerta | Alert | il +5 lo somma chi tira l'iniziativa; il plugin non la tira e non ha la sorpresa | Testo | F0 |
| Appostato | Skulker | la pill Nascosto resta quando manca con un attacco a distanza | Auto | F8, dopo T2 |
| Atleta | Athlete | — | Testo | F0 |
| Attore | Actor | sociale | Testo | F0 |
| Carica | Charger | dopo uno Scatto della scheda Azioni, l'attacco in mischia offre «+5 danni», la Spinta la nota «fino a 3 m» | Auto | F8 |
| Cecchino Magico | Spell Sniper | gittata doppia degli incantesimi con tiro per colpire, dove il pannello la misura; il trucchetto scelto nel libro | Auto | F3 |
| Combattente a Due Armi | Dual Wielder | +1 CA nella scheda | Testo | F0 |
| Combattente in Sella | Mounted Combatant | — | Testo | F0 |
| Condottiero Ispiratore | Inspiring Leader | un comando: PF temporanei pari a livello + Carisma a fino a sei creature amiche entro 9 m, sé compreso | Auto | F5 |
| Corazze Leggere, Medie, Pesanti | Lightly, Moderately, Heavily Armored | competenze nella scheda | Testo | F0 |
| Duellante Difensivo | Defensive Duelist | avviso di reazione quando è colpito in mischia: + bonus di competenza alla CA, con «un tiro da X a Y diventa Mancato» | Auto | F6 |
| Esperto di Balestre | Crossbow Expert | dopo un attacco con un'arma a una mano, «attacco bonus con la balestra a mano» | Prom. | F1 |
| Esperto di Dungeon | Dungeon Delver | — | Testo | F0 |
| Fortunato | Lucky | 3 punti fortuna | Risorsa | F0 |
| Guaritore | Healer | «Cura con la borsa»: 1d6 + 4 + i Dadi Vita massimi del bersaglio, con il d6 scritto dal GM; il PF in più della stabilizzazione resta al tavolo | Auto | F5 |
| Incantatore da Guerra | War Caster | l'avviso del TS di concentrazione dice «vantaggio»; l'avviso di attacco di opportunità ricorda l'incantesimo al posto dell'attacco | Prom. | F4, F6 |
| Incantatore Rituale | Ritual Caster | i rituali scelti si lanciano come rituali, senza slot | Auto | F3 |
| Iniziato alla Magia | Magic Initiate | due trucchetti nel libro; un incantesimo di 1° livello gratis una volta per riposo lungo, con la caratteristica della classe scelta | Auto, Risorsa | F3 |
| Linguista | Linguist | — | Testo | F0 |
| Lottatore | Grappler | attaccando una creatura che afferra, la console dice «vantaggio (Lottatore)»; azione «Immobilizza»: Trattenuto su tutti e due | Auto, Prom. | F8 |
| Lottatore da Taverna | Tavern Brawler | dopo un colpo senz'armi o con un'arma improvvisata, «Lotta come azione bonus» | Prom. | F8 |
| Maestro d'Armi | Weapon Master | competenze nella scheda | Testo | F0 |
| Maestro d'Armi Possenti | Great Weapon Master | «−5/+10»: +10 ai danni del colpo, «−5 al tiro» prima del tiro; dopo un critico o un nemico a 0 PF in mischia, «attacco bonus» | Auto, Prom. | F1 |
| Maestro degli Scudi | Shield Master | dopo un attacco, «Spinta come azione bonus»; nei suoi TS di Destrezza, «superato: 0 danni, con la reazione» | Prom. | F8 |
| Maestro delle Armature Medie | Medium Armor Master | CA nella scheda | Testo | F0 |
| Maestro delle Armature Pesanti | Heavy Armor Master | −3 ai danni contundenti, perforanti e taglienti delle armi non magiche, nelle due console, con una riga ✕ per l'attacco | Auto, **PF** | F7 |
| Maestro delle Armi su Asta | Polearm Master | l'attacco con l'altra estremità (1d4 contundenti) come seguito; avviso quando un nemico entra nella portata | Auto | F6 |
| Mente Acuta | Keen Mind | — | Testo | F0 |
| Mobilità | Mobile | +3 m nel tracker movimento; con lo Scatto il terreno difficile non rallenta; nessun avviso di AdO dalle creature attaccate in mischia nel turno | Auto | F2 |
| Osservatore | Observant | +5 alla Percezione passiva, nella scheda | Testo | F0 |
| Resiliente | Resilient | la competenza è nel totale del TS della scheda | Testo | F0 |
| Robusto | Tough | card con il conto, «+2 PF massimi per livello: +10 al 5°», da comprendere nei PF massimi; nessuna scrittura | Testo | F0 |
| Sentinella | Sentinel | avviso di AdO anche contro il Disimpegno; se l'AdO colpisce, velocità 0 per il resto del turno; avviso quando un nemico entro 1,5 m attacca un altro | Auto | F6 |
| Sterminatore di Maghi | Mage Slayer | avviso quando un nemico entro 1,5 m lancia; «svantaggio» nell'avviso del TS di concentrazione di chi ha ferito; il vantaggio ai TS contro gli incantesimi vicini come promemoria | Auto, Prom. | F6, F4 |
| Tenace | Durable | nel riposo breve, «Tenace: almeno 2 × Costituzione per dado» | Prom. | F5 |
| Tiratore Scelto | Sharpshooter | «−5/+10» per gli attacchi a distanza, come Maestro d'Armi Possenti; gittata lunga e copertura restano al tavolo | Auto | F1 |

### 5.2 Xanathar (15)

| Talento | Inglese | Che cosa fa il plugin | Livello | Lotto |
|---|---|---|---|---|
| Agilità Tarchiata | Squat Nimbleness | +1,5 m nel tracker movimento; «vantaggio per liberarsi» nella fuga dalla presa | Auto, Prom. | F2 |
| Alta Magia Drow | Drow High Magic | Individuazione del magico a volontà; Levitazione e Dissolvi magie una volta per riposo lungo | Auto, Risorsa | F3 |
| Costituzione Infernale | Infernal Constitution | resistenza a freddo e veleno nelle difese; il vantaggio contro Avvelenato come promemoria | Auto | F7 |
| Fiamme di Flegesto | Flames of Phlegethos | dopo un incantesimo di fuoco, pill fino alla fine del suo prossimo turno con la ritorsione 1d4 fuoco su chi lo colpisce in mischia, come Scudo di fuoco; «ritira gli 1» come promemoria | Auto, Prom. | F6 |
| Fortuna Generosa | Bountiful Luck | reazione al tiro di un alleato: gli avvisi non vedono i tiri (gruppo G dello studio delle reazioni) | Testo | F0 |
| Furia Orchesca | Orcish Fury | un dado dell'arma in più al colpo, come Attacchi selvaggi; l'attacco con la reazione dopo Tenacia implacabile come promemoria | Auto, Risorsa | F1 |
| Magia degli Elfi dei Boschi | Wood Elf Magic | un trucchetto da druido nel libro; Passo veloce e Passare senza tracce una volta per riposo lungo | Auto, Risorsa | F3 |
| Paura Draconica | Dragon Fear | al posto del soffio, il ruggito: TS Saggezza, Spaventato per 1 minuto con il tiro ripetuto; spende l'uso del soffio | Auto | F9 |
| Pelle di Drago | Dragon Hide | gli artigli come arma naturale nella console (1d4 + Forza, taglienti); la CA nella scheda | Auto | F1 |
| Precisione Elfica | Elven Accuracy | dadi del tavolo | Testo | F0 |
| Prodigio | Prodigy | competenze nella scheda | Testo | F0 |
| Scomparire | Fade Away | avviso dopo un danno: pill Invisibile fino alla fine del suo prossimo turno, che finisce quando attacca, come Passo nascosto | Auto, Risorsa | F6 |
| Seconda Possibilità | Second Chance | avviso quando è colpito: l'attaccante ritira il d20, come Scudo Runico; spende l'uso e la reazione | Auto, Risorsa | F6 |
| Teletrasporto Fatato | Fey Teleportation | Passo velato una volta per riposo breve, con il teletrasporto che c'è già | Auto, Risorsa | F3 |
| Tempra Nanica | Dwarven Fortitude | con la Schivata della scheda Azioni, «spendi un Dado Vita»: cura dado + Costituzione, con il tiro scritto dal GM | Auto, **PF** | F8 |

### 5.3 Tasha (15)

| Talento | Inglese | Che cosa fa il plugin | Livello | Lotto |
|---|---|---|---|---|
| Abilità Impeccabile | Skill Expert | competenze nella scheda | Testo | F0 |
| Adepto di Metamagia | Metamagic Adept | le due opzioni scelte, come quelle dello stregone, con 2 punti suoi | Auto, Risorsa | F9 |
| Adepto Occulto | Eldritch Adept | la supplica scelta come card del warlock, oggi quasi tutte di riferimento | Testo | F9 |
| Bisturi da Battaglia | Slasher | su un colpo tagliente, una volta per turno: pill «−3 m» sul bersaglio fino all'inizio del prossimo turno del talentuoso, letta dal tracker movimento; al critico, pill «svantaggio ai tiri per colpire» | Auto | F1 |
| Contaminazione Fatata | Fey Touched | Passo velato e un incantesimo di 1° livello di divinazione o ammaliamento, gratis una volta per riposo lungo ciascuno, poi anche con gli slot; CD con la caratteristica scelta | Auto, Risorsa | F3 |
| Contaminazione Ombrosa | Shadow Touched | lo stesso, con Invisibilità e un incantesimo di illusione o necromanzia | Auto, Risorsa | F3 |
| Cuoco | Chef | «Delizie»: PF temporanei pari al bonus di competenza a chi ne mangia una; il +1d8 del riposo breve come promemoria | Auto, Prom. | F5 |
| Maestria dei Veleni | Poisoner | i suoi danni da veleno ignorano la resistenza al veleno; «Veleno potente» al colpo: TS Costituzione CD 14, 2d8 veleno e Avvelenato fino alla fine del suo prossimo turno | Auto | F7 |
| Martello Vivente | Crusher | su un colpo contundente, una volta per turno, la nota «sposta di 1,5 m»; al critico, pill sul bersaglio che la console mostra a chi lo attacca, «vantaggio agli attacchi contro» | Auto, Prom. | F1 |
| Pistolero | Gunner | — | Testo | F0 |
| Rudimenti da Artefice | Artificer Initiate | un trucchetto e un incantesimo di 1° livello gratis una volta per riposo lungo, con Intelligenza; la classe artefice non c'è | Auto, Risorsa | F3 |
| Rudimenti da Guerriero | Fighting Initiate | lo stile scelto come card del guerriero, oggi di riferimento | Testo | F9 |
| Stile Penetrante | Piercer | al critico perforante, un dado di danno in più, come Attacchi selvaggi; «ritira un dado, una volta per turno» come promemoria | Auto, Prom. | F1 |
| Telecinesi | Telekinetic | Mano magica nel libro; l'azione bonus «Spinta telecinetica», TS Forza con la CD del talento; il token si sposta a mano | Auto | F3 |
| Telepatia | Telepathic | Individuazione dei pensieri gratis una volta per riposo lungo; la telepatia è testo | Auto, Risorsa | F3 |

### 5.4 Riepilogo

| Livello | PHB | XGE | TCE | Totale |
|---|---:|---:|---:|---:|
| Auto, anche in parte | 18 | 12 | 11 | **41** |
| Solo promemoria | 6 | 0 | 0 | 6 |
| Solo risorsa | 1 | 0 | 0 | 1 |
| Testo | 17 | 3 | 4 | 24 |

| Lotto | Talenti |
|---|---:|
| F0 | 23 |
| F1 | 9 |
| F2 | 2 |
| F3 | 11 |
| F4 | 1, più una parte di Sterminatore di Maghi |
| F5 | 4 |
| F6 | 7, più una parte di Incantatore da Guerra |
| F7 | 4 |
| F8 | 6 |
| F9 | 5 |

### 5.5 Che cosa serve, sottosistema per sottosistema

**Console attacchi (F1).**

- I dadi di un talento non hanno livello di classe: fissi, bonus di competenza,
  livello totale, caratteristica, dado dell'arma.
- Il segno meno nel bonus al tiro (`pcAttackActivationRollBonus`).
- −5/+10 è un'attivazione. «−5» compare prima del tiro, quindi anche su un
  mancato, come Colpo Guidato (`pcAttackActivationCatalog.js:149-150`). Il +10
  è un componente del tipo dell'arma, solo in mischia per Maestro d'Armi
  Possenti e solo a distanza per Tiratore Scelto.
  - Se l'arma è pesante lo sa il tavolo (`pcAttackCore.js:2-3`).
- I talenti «una volta per turno con quel tipo di danno» sono attivazioni con
  `requires.damageType` e `limit`, non extra al colpo: Bisturi, Martello,
  Stile Penetrante.
- I critici con un dado in più copiano Attacchi selvaggi
  (`pcAttackActivationCatalog.js:178`, `weaponDieOf` in `pcAttackCore.js:816`).
- Le pill sul bersaglio usano le scadenze che esistono già
  (`classFeatureCore.js:627-633`). Il −3 m segue il modello di Lancia della
  Letargia (`pcAttackActivationCatalog.js:154`). Il vantaggio contro si mostra
  con `pcAttackTargetNotes`.
- L'attacco bonus di Maestro d'Armi Possenti è un seguito (`pcAttackFollowUps`).
  Lo stesso per l'altra estremità di Maestro delle Armi su Asta.
- Gli artigli di Pelle di Drago seguono le armi naturali delle specie
  (`SPECIES_NATURAL_WEAPONS`, `speciesTraitCore.js:320`).

**Movimento (F2).**

- I +3 m e i +1,5 m sono `passiveMechanics.movement.addMeters` sul record:
  nessun codice nuovo oltre all'aggancio di F0.
- Il terreno difficile ignorato solo con uno Scatto nel turno, letto dal
  contatore degli scatti.
- Mobilità e gli AdO: `movementReactionEvents` salta i reattori che il mover ha
  attaccato in mischia in quel turno. Serve un registro dei bersagli in mischia
  del turno, scritto dal comando dell'attacco, accanto a `riderUses`.

**Incantesimi concessi (F3).**

- `speciesInnateSpellCore.js` diventa il modulo degli incantesimi di specie **e**
  di talento:
  - stessa CD, 8 + competenza + caratteristica;
  - stesso uso speso nel comando del lancio;
  - la caratteristica dal talento, o dalla classe scelta per Iniziato alla
    Magia.
- Un incantesimo scelto dal giocatore sta nella scelta del talento, non nel
  record. Il pool è per posto, non per incantesimo:
  `talento-contaminazione-fatata-1-usi`.
- `creatureCastableSpellIds` aggiunge gli incantesimi dei talenti: Scudo da
  Iniziato alla Magia diventa offribile come reazione.
- Nel libro gli incantesimi concessi sono sempre preparati e, dove il talento lo
  permette, si lanciano anche con gli slot (`spellbookGroups`, campo `granted`).
- Incantatore Rituale aggiunge i rituali scelti a `spellbookRitualCastable`
  (`spellbookCatalog.js:129`).
- La gittata doppia di Cecchino Magico vale dove il pannello misura la gittata
  dal caster.
- La Spinta telecinetica segue i tratti con TS delle specie (`speciesSave`).

**Concentrazione (F4).**

- `buildConcentrationSaveWarning` riceve le righe «vantaggio (Incantatore da
  guerra)» e «svantaggio (Sterminatore di Maghi)».
- Per lo svantaggio serve sapere chi ha inflitto il danno. Lo passano le due
  console, che conoscono l'attaccante; gli altri chiamanti restano come sono, e
  lì lo svantaggio non compare.
- Facoltativo: l'avviso mostra il totale del TS di Costituzione della scheda
  (`pcAttackTargetSaveBonus`, `pcAttackCore.js:73`). Serve a tutti, e a chi ha
  Resiliente in Costituzione.

**PF temporanei e cure (F5).**

- Condottiero Ispiratore: `activateClassFeature` con i PF temporanei sui
  bersagli, fino a sei, entro 9 m, sé compreso. L'importo «livello totale +
  Carisma» è nuovo: si affianca a quelli delle specie.
- Cuoco: un pool di delizie; «Dai una delizia» dà PF temporanei pari al bonus di
  competenza a una creatura scelta, come Scarica di adrenalina
  (`speciesTraitCore.js:484`).
- Guaritore: una cura con il dado scritto dal GM, come le Mani guaritrici dei
  Mostri del Multiverso (`speciesTraitCore.js:483`), più 4 e i Dadi Vita
  massimi del bersaglio. Per un PG sono il suo livello totale; per un'altra
  creatura li scrive il GM.
- Tenace: una nota nel riposo breve (`group-rest.js`, il campo dei PF dei Dadi
  Vita).

**Reazioni (F6).**

- Le voci hanno `source: "class-feature"` con `featureIds: ["talento-…"]`, mai un
  `source: "feat"` senza il suo controllo (§1.6). I lotti nuovi vanno in
  `REACTION_PROMPT_LOTS`.
- Duellante Difensivo copia Deviazione Arcana, con l'importo uguale al bonus di
  competenza.
- Seconda Possibilità copia Scudo Runico: il tiro è al tavolo.
- Scomparire: innesco «danno, dopo», flusso d'uso, pill Invisibile con
  `endsOnAttack`.
- Sentinella, tre pezzi:
  - il Disimpegno non esenta il mover dagli avvisi di quel reattore
    (`hasNoOpportunityPill`, `opportunityAttackCore.js:34`);
  - un attacco con la reazione che colpisce mette sul bersaglio la pill
    «velocità 0» fino alla fine del turno, con `setMeters: 0` come le pill
    che Abiurare Nemico e la Runa della Pietra mettono sul bersaglio;
  - una voce `protects: "other"`, entro 1,5 m, su colpito e mancato, con il
    flusso dell'attacco fuori turno. Non vale se il bersaglio attaccato ha
    Sentinella.
- Maestro delle Armi su Asta: l'entrata nella portata del reattore
  (`reactorReachMeters`, riga 22), con la scelta «portata 3 m» del talento.
- Sterminatore di Maghi: una voce «incantesimo lanciato» entro 1,5 m. Il
  pannello incantesimi oggi apre solo i flussi che conosce: deve imparare ad
  aprire la console fuori turno.
- Incantatore da Guerra: una riga nell'avviso di attacco di opportunità.
- Fiamme di Flegesto: il lancio di un incantesimo di fuoco mette la pill con la
  ritorsione, accanto a Scudo di fuoco, Ombra di Moil e Armatura di Agathys
  (`attackReactionsCore.js`).

**Difese (F7).**

- Le difese passive di un talento entrano in `profileDamageDefenses`
  (Costituzione Infernale).
- «Ignora la resistenza, non l'immunità» sui danni di quella creatura, accanto a
  `ignoredTypes`, sul modello di `bossMarkedDefenses` e del chip «superata (arma
  magica)». Vale nel pannello incantesimi, nelle aree e nella console.
- Maestro delle Armature Pesanti è una riduzione **passiva**. Non passa per le
  reazioni, che spendono la reazione.
  - Vale solo per gli attacchi con arma senza ✦ Magica, sui componenti
    contundenti, perforanti e taglienti.
  - Si applica prima della resistenza, come vuole l'ordine 2014.
  - Una riga ✕ sulla bozza la toglie per quell'attacco; la riga «perché» va
    nella Cronologia.
- Il Veleno potente è un'attivazione al colpo, con TS, danno e condizione con
  scadenza.

**Azioni di turno (F8, dopo T2–T4).**

- Carica: un'attivazione che richiede uno Scatto della scheda Azioni nel turno.
- Maestro degli Scudi:
  - dopo un attacco, il rimando alla Spinta;
  - nelle righe dei TS di Destrezza, il promemoria «superato: 0 danni, con la
    reazione». Il GM sceglie Immune.
- Lottatore:
  - `pcGrappleHolds` dice se l'attaccante afferra il bersaglio;
  - «Immobilizza» è un'azione nuova della scheda Azioni: una prova di Lotta;
    se riesce, Trattenuto su chi afferra e su chi è afferrato.
- Lottatore da Taverna: dopo un colpo senz'armi, riconosciuto dall'etichetta
  come oggi (`pcAttackCore.js:1128`).
- Appostato: dopo T2, l'eccezione alla fine di Nascosto su un attacco a distanza
  mancato.
- Tempra Nanica: dopo una Schivata della scheda Azioni.

**Capacità prese in prestito (F9).**

- Adepto Marziale accende le due manovre scelte (16 record «assistita» del
  Maestro di Battaglia), con il suo pool di un d6.
- Adepto di Metamagia accende due delle otto opzioni «assistita», con i suoi 2
  punti, solo per la metamagia.
- Adepto Occulto e Rudimenti da Guerriero mostrano la card della supplica o
  dello stile scelti. Oggi sono quasi tutte di riferimento, anche per il
  warlock e il guerriero.
- Paura Draconica è una variante del soffio della specie, come quelle del soffio
  metallico (`speciesTraitCore.js:605-614`), e spende lo stesso uso.

---

## 6. Rischi, come chiede AGENTS.md

| Area | Rischio | Come lo si evita |
|---|---|---|
| **Metadata del token** | Un campo nuovo, `feats`, dentro `initiativeCard`. | Si scrive solo se usato; si fonde con `mergeProfile`, mai sostituendo la scheda; le schede senza talenti restano identiche. |
| **Metadata della stanza** | Il registro delle schede ha 4.450 byte e un gruppo intero non ci entra già oggi (`STUDIO_REGISTRO_SCHEDE_STANZA.md`). | Id corti, scelte solo dove servono, misura in un test con la codifica vera. |
| **PF (`meta.hp`, `meta.hpMax`, `meta.tempHp`)** | F5 scrive PF temporanei e cure; Tempra Nanica (F8) cura; F7 **cambia il danno** che si scrive. | F5 e F8 usano solo flussi che esistono: un comando, una voce, un Annulla. F7 si spiega con il piano esatto e aspetta il via prima del codice. Robusto non scrive niente: CAP-MAXHP non si usa (M0). |
| **Barre PF sulla mappa** | Nessuno: derivano da `meta.hp`. | Nessun lavoro sugli allegati. |
| **Turno attivo, ordine, id virtuali** | Nessun lotto li tocca. Allerta resta testo. | — |
| **`initiativeList.js`** | Il menu della card e un chiamante dell'avviso di concentrazione vivono lì. | Il menu riceve i talenti da `buildClassFeatureContextEntries`. F4 lascia quel chiamante com'è. Nessun lotto lo modifica. |
| **Loop di metadata** | Nessuno: tutto nasce da clic. | — |
| **Avvisi di reazione** | Un `source: "feat"` sconosciuto verrebbe offerto a tutti. | `source: "class-feature"` con gli id dei talenti; test che controllano chi riceve l'avviso. |
| **Testi dei manuali** | Il repository è pubblico. | Nessun testo nel catalogo; scanner dei testi privati; Lottatore dall'SRD. |
| **Lavori di altre sessioni** | Le azioni di turno sono in corso: `speedCheckCore.js`, `initiativeMovementPresentation.js` e `initiativeList.js` sono modificati nella cartella. `opportunityAttackCore.js` e `pcAttackTurnActionCore.js` sono appena cambiati con T1. | F2, F6 e F8 partono dopo quei lavori, rileggendo le righe: quelle citate qui possono spostarsi. |

---

## 7. Lotti

| Lotto | Contenuto | Tocca (previsti) | Scrive PF? | Rischio |
|---|---|---|---|---|
| **F0** | Fondamenta. Catalogo dei 72 talenti, solo meccaniche. Campo `feats`. Riquadro Talenti nel modale e badge. Testo dal pacchetto. Lottatore nel compendio SRD. Import `feats` e documentazione. Fortunato come risorsa. Le 22 card di riferimento, Robusto con il conto. I testi «Talento» delle due specie. | nuovo `src/featCatalog.js`; `classFeatureCatalog.js`; `classFeatureRuntime.js` (`characterResourcePools`); `initiativeCards.js`; `initiative-card-modal.js` e `.html`; `characterSheetImportCore.js`; `docs/IMPORT_SCHEDA.md`; indice SRD e `src/rules-reference-it.json`; `speciesTraitCore.js`, `speciesCatalogTasha.js`; test | No | Basso-medio: metadata della scheda, budget della stanza |
| **F1** | Console attacchi: Maestro d'Armi Possenti, Tiratore Scelto, Stile Penetrante, Furia Orchesca, Bisturi da Battaglia, Martello Vivente, Pelle di Drago, Aggressore Selvaggio, Esperto di Balestre. | `pcAttackActivationCatalog.js`, `pcAttackRiderCatalog.js`, `pcAttackCore.js`, armi naturali | No: componenti nel comando dell'attacco che c'è già | Basso |
| **F2** | Movimento: Mobilità, Agilità Tarchiata. | record dei talenti; `movementProfileCore.js`; `opportunityAttackCore.js`; registro dei bersagli del turno | No | Medio: Speed Tracker delicato e in lavorazione |
| **F3** | Incantesimi concessi: Iniziato alla Magia, le due Contaminazioni, Rudimenti da Artefice, Telepatia, Telecinesi, Alta Magia Drow, Magia degli Elfi dei Boschi, Teletrasporto Fatato, Cecchino Magico, Incantatore Rituale. Il doppione con le azioni rapide (§4.7). | `speciesInnateSpellCore.js`, `attackReactionsCore.js`, `spellbookCatalog.js`, `spell-unified-panel.js` | No | Medio: pannello incantesimi |
| **F4** | Concentrazione: Incantatore da Guerra, lo svantaggio di Sterminatore di Maghi, il totale del TS di Costituzione. | `concentrationSaveReminderCore.js`, il popup dell'avviso, i chiamanti delle due console | No | Basso |
| **F5** | PF temporanei e cure: Condottiero Ispiratore, Cuoco, Guaritore, Tenace. | record dei talenti; un importo nuovo; `group-rest.js` (nota) | **Sì**, con i flussi esistenti | Medio: piano spiegato prima del codice |
| **F6** | Reazioni: Duellante Difensivo, Seconda Possibilità, Scomparire, Sentinella, Maestro delle Armi su Asta, Sterminatore di Maghi, Fiamme di Flegesto, la riga di Incantatore da Guerra. | `reactionTriggerCatalog.js`, `reactionCandidatesCore.js`, `reactionPromptView.js`, `opportunityAttackCore.js`, `spell-unified-panel.js`, `attackReactionsCore.js` | No: flussi esistenti; la velocità 0 è una pill | Medio |
| **F7** | Difese: Costituzione Infernale, Adepto Elementale, Maestria dei Veleni, Maestro delle Armature Pesanti. | `damageDefensesCore.js`, `spellDamageDefenseCore.js`, `pcAttackCore.js`, `bossActionExecutionCore.js`, `bossActionsViewCore.js` | **Sì: cambia il danno** | **Alto**: piano esatto e via dell'utente prima del codice |
| **F8** | Azioni di turno, **dopo T2–T4** dello studio delle azioni: Carica, Maestro degli Scudi, Lottatore, Lottatore da Taverna, Appostato, Tempra Nanica. | `pcAttackTurnActionCore.js`, `pcAttackManeuverCore.js`, console | Sì per Tempra Nanica (cura) | Medio |
| **F9** | Capacità prese in prestito: Adepto Marziale, Adepto di Metamagia, Adepto Occulto, Rudimenti da Guerriero, Paura Draconica. | catalogo dei talenti, record di manovre, metamagia, suppliche e stili; soffio della specie | No | Medio: pool separati |
| **FD** | Dati: la voce Cuoco nell'indice privato di Tasha; i nomi italiani negli studi delle reazioni e delle azioni. | cartella privata, `docs/` | No | Basso |

**Ordine consigliato:** F0 → F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9.

- F1, F2 e F3 hanno il guadagno più alto per il costo:
  - −5/+10 entra in ogni attacco;
  - Mobilità entra in ogni turno, quasi senza codice;
  - gli incantesimi gratuiti sono tra i talenti più presi.
- F5 e F7 scrivono PF: F5 usa flussi già provati, F7 cambia il calcolo e va per
  ultimo fra i lotti di combattimento.
- F8 aspetta T2–T4 delle azioni di turno; F9 è il guadagno più basso.
- FD si fa quando serve, ma Cuoco va corretto prima del test dei testi di F0.

Ogni lotto ha:

- test che falliscono senza la patch;
- la CI completa in una copia pulita;
- le voci in `PROVE_IN_STANZA.md`;
- la prova in vista compatta ed estesa.

### 7.1 F0, fatto il 15/11

**Che cosa c'è.**

- `src/featCatalog.js`: i 72 talenti senza testi dei manuali, con le voci del
  pacchetto (`rulesEntryId`), i prerequisiti in breve, le caratteristiche dei
  mezzi talenti, le specie dei talenti razziali e la riga «Nel plugin». Il
  campo `feats` della scheda e la sua pulizia, che controlla solo la forma.
- Le voci vanno in coda a `getEnabledClassFeatures` e nelle mappe per id
  (`classFeatureCatalog.js`); il riposo ripristina i loro pool
  (`characterResourcePools`).
- **Fortunato**: 3 punti fortuna, un pulsante che ne spende uno, il ritorno con
  il riposo lungo.
- **Robusto**: la riga conta i PF sul livello totale, senza scriverli.
- Nel modale:
  - il riquadro Talenti in Modifica → Capacità, con gli avvisi D8;
  - i badge;
  - le card, con il testo dal pacchetto o la nota del pacchetto mancante, più
    la riga «Nel plugin».
- La sezione «Talenti» dell'import e `docs/IMPORT_SCHEDA.md`.
- I testi «Talento» di Umano variante e Lignaggio personalizzato rimandano al
  riquadro.
- I test sono in `test/featCatalog.test.js`, le prove in stanza in
  `PROVE_IN_STANZA.md`, B21.

**Il Cuoco (parte di FD).** Corretto nella cartella privata:

- una correzione dell'OCR in `tasha-correzioni.json` e `tasha-indice.json`;
- rigenerate le regole di Tasha e ricostruito solo il pacchetto di Tasha. Cambiano
  solo `tce-contaminazione-ombrosa` e la voce nuova `tce-cuoco`;
- il GM deve **reimportare il pacchetto di Tasha** nell'Enciclopedia.

**Scelte prese nel codice.**

- **Caratteristica salvata:** solo quando il mezzo talento ne offre più d'una.
- **Scelte di F0:** solo caratteristica e tipo di danno. Classe e incantesimi
  arrivano con F3: fino ad allora gli incantesimi dei talenti restano nelle
  Azioni rapide (D6).
- **Testo della card:** per una voce di talento `classFeatureDescription`
  restituisce solo il testo del pacchetto. La `description` del record è la
  riga «Nel plugin», mostrata a parte.
- **Import:** scarta i doppioni esatti; Adepto Elementale resta due volte solo
  con due tipi diversi.
- **Talenti dei lotti successivi:** la riga «Nel plugin» dice «Per ora solo
  riferimento: si gestisce al tavolo».

**Che cosa manca.** Lottatore nel compendio SRD. Il generatore vuole il PDF
dell'SRD italiano (`SRD_CC_v5.1_IT.pdf`), che sul disco non c'è: va scaricato
con il permesso dell'utente. Intanto la card di Lottatore prende il testo dal
pacchetto del PHB, come gli altri talenti.

---

## 8. Che cosa resta al tavolo

- **I dadi:** ritirare, «1 come 2», vantaggio e svantaggio sono promemoria.
- **Le proprietà delle armi:** pesante, accurata, ad asta, a una mano. Il GM
  sceglie l'opzione quando vale.
- **Le liste di classe** degli incantesimi scelti.
- **L'armatura indossata** di Maestro delle Armature Pesanti.
- **«Una volta per creatura fino al riposo»** di Condottiero Ispiratore e
  Guaritore.
- **I 24 talenti di testo:** competenze, armature, lingue, sociale.
- **Iniziativa e sorpresa** di Allerta.
- **La linea retta** della Carica e la **copertura** di Tiratore Scelto e
  Cecchino Magico.

---

## 9. Decisioni per l'utente

**Esito:** il 15/11 l'utente le ha approvate tutte come raccomandate
(«Approvo tutto»). La colonna «Raccomandazione» è quindi la decisione presa. D1
l'aveva già indicata durante lo studio.

Le decisioni non sostituiscono il piano dei lotti che scrivono PF (§6, §7):

- F5 e Tempra Nanica (F8) si spiegano prima del codice;
- F7 cambia il danno: piano esatto e via dell'utente prima del codice.

| # | Decisione | Possibilità | Raccomandazione |
|---|---|---|---|
| **D1** | Perimetro | PHB, XGE, TCE: 72 talenti | **Indicato dall'utente il 15/11.** Gli altri libri dopo, con la stessa forma. |
| **D2** | Dove vivono i talenti | (a) record con la forma delle capacità, in coda a `getEnabledClassFeatures` come specie e doni; (b) un sistema a parte | **(a)**: console, reazioni, movimento, risorse e menu della card li vedono con il solo id. |
| **D3** | Testi | (a) nel repository meccaniche e riga «Nel plugin»; testo dalla voce del pacchetto; Lottatore dall'SRD; (b) riassunti scritti per il plugin, come le specie; (c) testi copiati nei pacchetti come capacità | **(a)**: i testi sono già nei pacchetti, e niente parafrasi di 72 regole in un repository pubblico. |
| **D4** | Mezzi talenti e Resiliente | (a) il +1 e la competenza non si applicano: la scheda li contiene già; la caratteristica scelta si salva; (b) i punteggi di caratteristica nella scheda | **(a)**: la scheda tiene i modificatori, non i punteggi. |
| **D5** | Campo e import | `feats: [{ id, ability?, choice? }]`, scritto solo se usato; l'import sostituisce l'elenco; nomi in italiano o in inglese; quelli sconosciuti in rosso | Come proposto. |
| **D6** | Incantesimi concessi | (a) con il talento: usi propri, CD del talento, nel libro come «Talento»; `IMPORT_SCHEDA.md` cambia; (b) nelle Azioni rapide, come oggi | **(a)**, da F3. Fino ad allora restano nelle Azioni rapide. |
| **D7** | Azioni rapide già create a mano per un talento | (a) la scheda le segnala come doppioni e propone di toglierle; (b) le toglie da sola; (c) niente | **(a)**: nessuna cancellazione automatica. |
| **D8** | Prerequisiti | (a) avvisi; (b) blocchi | **(a)**: specie diversa, doppione, livello o scuola. Le liste di classe restano al GM. |
| **D9** | −5/+10 | (a) un'attivazione per attacco: +10 nel colpo e «−5» prima del tiro, scelta dal GM quando l'arma lo permette; (b) un interruttore acceso per tutto il turno | **(a)**: un clic che sostituisce un conto. (b) si dimentica acceso. |
| **D10** | Robusto e Allerta | (a) card di riferimento con il conto, nessuna scrittura; (b) Robusto come bonus dei PF massimi | **(a)**: i PF massimi li scrive il GM e la memoria tiene la base (M0). Un bonus da pill sparirebbe nelle altre scene. |
| **D11** | Maestro delle Armature Pesanti | (a) −3 automatico nelle due console, con una riga ✕ per l'attacco e il «perché» nella Cronologia; (b) solo promemoria | **(a)**, in F7, con il piano approvato prima. L'armatura si dà per indossata: senza, il GM toglie la riga. |
| **D12** | Ignorare la resistenza (Adepto Elementale, Maestria dei Veleni) | (a) solo la resistenza, non l'immunità, in pannello, aree e console; (b) promemoria | **(a)**, in F7. |
| **D13** | «Una volta per creatura fino al riposo» | (a) resta al GM; (b) una pill sul bersaglio fino al riposo | **(a)**: succede fuori dal combattimento, e una pill per creatura affollerebbe lo schermo del tavolo. |
| **D14** | Pool di Adepto Marziale e Adepto di Metamagia | (a) pool del talento, separati da quelli della classe; (b) sommati a quelli della classe | **(a)**: il d6 non è il dado del Maestro di Battaglia, e i punti valgono solo per la metamagia. |
| **D15** | Ordine dei lotti | per guadagno: F0 → F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9 | Come proposto; F8 dopo T2–T4 delle azioni di turno. |

---

## 10. Che cosa non fa questo studio

- Non scrive codice.
- Non copre i talenti 2024 né quelli degli altri libri.
- Non tira dadi e non decide vantaggio o svantaggio.
- Non controlla proprietà delle armi, armature indossate e liste di classe.
- Non conta azioni, azioni bonus e reazioni a mano: niente economia d'azione.
- Non tocca il turno attivo, l'ordine d'iniziativa e il tiro d'iniziativa.
- Non scrive i PF massimi.
