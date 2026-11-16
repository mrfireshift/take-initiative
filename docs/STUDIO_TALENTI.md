# Studio: talenti

Data: 15 novembre 2026. Stato: **studio, decisioni D1–D15 approvate
dall'utente il 15/11** (§9); **F0 fatto il 15/11** (§7.1), **F1 il 16/11**
(§7.2), **la prima parte di F3 il 16/11** (§7.3); **il piano di F3b il 16/11,
con S1–S9 approvate** (§7.4), **F3b-1, F3b-2, F3b-3, F3b-4 e F3b-5 il 16/11**
(§7.5–§7.9): F3 è chiuso. **F4 il 16/11** (§7.10). **Il piano di F5 il 16/11,
con H1–H7 approvate** (§7.11), **F5-1, F5-2 e F5-3 il 16/11** (§7.12–§7.14):
F5 è chiuso. **Il piano di F6 il 16/11, con K1–K6 approvate** (§7.15), **F6-1…F6-5
il 16/11** (§7.16–§7.20): F6 è chiuso. **Il piano di F9 il 16/11** (§7.21),
**F9-1 il 16/11** (§7.22).
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

**Lottatore nel compendio SRD (16/11).** Con il permesso dell'utente è stato
scaricato `SRD_CC_v5.1_IT.pdf`, letto con il `pdftotext` di Xpdf.

- Il generatore rifà il compendio identico a quello committato, salvo la data.
- `scripts/srd-rules-outline-it.json` torna a Personaggio dopo le Merci escluse,
  con la sezione «Talenti» (p. 84) e la voce «Lottatore». Una correzione divide
  il prerequisito dal testo.
- In `src/rules-reference-it.json` nascono solo le voci `talenti` e
  `lottatore`.
- La card di Lottatore mostra il testo del pacchetto del PHB se c'è, altrimenti
  quello dell'SRD (`srdText` nel catalogo). Un test controlla che sia parola per
  parola la voce del compendio.

### 7.2 F1, fatto il 16/11

**Nella console attacchi** (`pcAttackActivationCatalog.js`), come attivazioni
delle voci dei talenti:

- **Maestro d'Armi Possenti** in mischia e **Tiratore Scelto** a distanza:
  «−5/+10» (D9). Il −5 si sceglie prima del tiro, quindi anche su un mancato;
  il +10 è un componente del tipo dell'arma, solo se colpisce.
- **Stile Penetrante**: al critico con danni perforanti, un dado dell'arma in
  più, non raddoppiato, come Attacchi selvaggi.
- **Furia Orchesca**: un dado dell'arma in più, con il suo uso che torna con il
  riposo breve (`talento-furia-orchesca-dado-usi`).
- **Bisturi da Battaglia**: una volta per turno su un colpo tagliente, la pill
  «−3 m» sul bersaglio fino all'inizio del prossimo turno di chi attacca, letta
  dal tracker movimento come quella di Lancia della Letargia. Al critico, la
  pill dello svantaggio, da una seconda voce (`talento-bisturi-da-battaglia-critico`).
- **Martello Vivente**: una volta per turno su un colpo contundente, la nota
  «spostato di 1,5 m»; al critico, la pill «Martello Vivente» sul bersaglio.

**I promemoria, senza clic** (`pcAttackTargetNotes`, `pcAttackFollowUps`):

- prima del tiro:
  - con la pill di Martello Vivente sul bersaglio, «vantaggio all'attacco»;
  - con quella del critico di Bisturi sull'attaccante, «svantaggio»;
  - in mischia, il ritiro di Aggressore Selvaggio;
  - sui colpi perforanti, il ritiro di Stile Penetrante;
- dopo il colpo:
  - l'attacco bonus di Maestro d'Armi Possenti, dopo un critico in mischia o un
    nemico portato a 0 PF;
  - quello di Esperto di Balestre, dopo un attacco con un'arma.

**Pelle di Drago**: gli artigli (1d4 + Forza, taglienti) si aggiungono agli
Attacchi dalla card, come le armi naturali delle specie.

**Correzioni della console nate da F1:**

- `pcAttackActivationRollBonus` scriveva «+-5» per un bonus negativo;
- un'attivazione scelta prima del tiro che fa anche danni non chiede il danno su
  un mancato: lì conta solo il bonus al tiro.

**Restano al tavolo:**

- se l'arma è pesante, se il PG è competente;
- se l'arma era a una mano, per Esperto di Balestre;
- i dadi che si ritirano.

I PF non cambiano strada: i danni passano dal comando dell'attacco di sempre.

### 7.3 F3, prima parte (F3a), fatta il 16/11

F2 aspetta: due dei suoi file (`speedCheckCore.js`,
`initiativeMovementPresentation.js`) sono in lavorazione in un'altra sessione,
e lo studio fa partire F2 dopo quei lavori (§6). F3 si divide in due:

- **F3a**, gli incantesimi propri dei talenti;
- **F3b**, quelli che sceglie il giocatore.

**F3a.** Sette talenti hanno incantesimi propri. Ognuno è una voce
`talento-<talento>-<incantesimo>` con `innateSpell` e il suo uso, lanciata come
un incantesimo di specie (`speciesInnateSpellCore.js`):

| Talento | Incantesimi | Uso |
|---|---|---|
| Alta Magia Drow | Individuazione del magico; Levitazione, Dissolvi magie | a volontà; 1 per riposo lungo ciascuno |
| Magia degli Elfi dei Boschi | Passo veloce, Passare senza tracce | 1 per riposo lungo ciascuno |
| Teletrasporto Fatato | Passo velato | 1 per riposo breve o lungo |
| Contaminazione Fatata, Contaminazione Ombrosa, Telepatia | Passo velato, Invisibilità, Individuazione dei pensieri | 1 per riposo lungo, e con gli slot |
| Telecinesi | Mano magica | a volontà |

- L'uso si spende nel comando del lancio. La CD è 8 + competenza + la
  caratteristica del talento: quella scelta per il mezzo talento, altrimenti la
  più alta fra quelle che offre. Alta Magia Drow, Elfi dei Boschi e
  Teletrasporto Fatato hanno la loro.
- Gli incantesimi che il talento lascia lanciare anche con gli slot stanno nel
  libro, sempre preparati, come «Talento: …» (D6).
- `creatureCastableSpellIds` li conosce, per gli avvisi di reazione.
- D7: se lo stesso incantesimo è anche fra le Azioni rapide, la riga del talento
  lo dice e non toglie niente.
- `docs/IMPORT_SCHEDA.md` e la nota sotto il libro: gli incantesimi propri dei
  talenti non vanno più nelle Azioni rapide.

**F3b, da fare.** Gli incantesimi scelti:

- Iniziato alla Magia, con la classe;
- l'incantesimo di 1° livello delle due Contaminazioni;
- il trucchetto degli Elfi dei Boschi;
- Rudimenti da Artefice;
- il trucchetto di Cecchino Magico;
- i rituali di Incantatore Rituale.

Servono i selettori nella scheda, filtrati per livello e scuola (D8), e le
chiavi dell'import. Poi la gittata doppia di Cecchino Magico e la spinta di
Telecinesi. Il piano è nella §7.4.

### 7.4 F3b, piano (16/11)

Solo piano: nessun codice. Le decisioni S1–S9 sono in fondo alla sezione.

#### 7.4.1 Le scelte da coprire

| Talento | Che cosa si sceglie | Uso | Caratteristica | Anche con gli slot |
|---|---|---|---|---|
| Iniziato alla Magia | una classe fra bardo, chierico, druido, stregone, warlock e mago; due trucchetti; un incantesimo di 1° livello | trucchetti a volontà; il 1° una volta per riposo lungo, al livello minimo | della classe: Car per bardo, stregone e warlock; Sag per chierico e druido; Int per il mago | sì, se il PG ha slot (Sage Advice) |
| Contaminazione Fatata | un incantesimo di 1°, divinazione o ammaliamento | una volta per riposo lungo | del talento (F3a) | sì |
| Contaminazione Ombrosa | un incantesimo di 1°, illusione o necromanzia | una volta per riposo lungo | del talento | sì |
| Magia degli Elfi dei Boschi | un trucchetto da druido | a volontà | Saggezza | — |
| Rudimenti da Artefice | un trucchetto e un incantesimo di 1° da artefice | trucchetto a volontà; il 1° una volta per riposo lungo | Intelligenza | sì |
| Cecchino Magico | una classe come Iniziato alla Magia; un trucchetto con tiro per colpire | a volontà | della classe | — |
| Incantatore Rituale | una classe come Iniziato alla Magia; due rituali di 1°, poi quelli trovati fino a metà del livello | solo come rituali, senza slot | della classe | no |

Poi due pezzi senza scelta:

- la gittata doppia e la copertura di Cecchino Magico;
- la spinta di Telecinesi: azione bonus, TS su Forza, 1,5 m verso il PG o
  lontano.

#### 7.4.2 Che cosa c'è già

- **F3a** (§7.3): voci `talento-<talento>-<incantesimo>` con `innateSpell` e un
  uso. Si lanciano con `speciesSpellCast`, `planSpeciesSpellCost` e
  `speciesSpellOpenRequest` (`speciesInnateSpellCore.js`). Nel libro passano da
  `featGrantedSpells` (`featCatalog.js`); fra i lanciabili da
  `creatureCastableSpellIds` (`attackReactionsCore.js:48-62`).
- **Chi legge lo `spellId` statico della voce:**
  - il menu della card e le azioni rapide (`initiativeList.js:9049-9063` e
    9110-9128). Risolvono la voce dalla mappa statica
    (`getClassFeatureDefinition`) e chiamano `speciesSpellOpenRequest(feature,
    sourceId)` senza la scheda. La voce del tracker non porta la scheda
    (`entryFromSceneItem`, righe 5429-5512);
  - la scheda (`openSpeciesSpell` e `buildSpeciesSpellControls`,
    `initiative-card-modal.js:2256-2283`);
  - il pannello (`speciesCastFor`, `spell-unified-panel.js:517-525`). Controlla
    che l'incantesimo sia quello della voce e applica la CD del TS (riga 622),
    non il bonus d'attacco;
  - la console: una voce con un incantesimo innato dice «Apri nella scheda»
    (`pcAttackFeatureFormCore.js:157`).
- **Il libro:**
  - concessi con la fonte (`spellbookGroups`, `spellbookCatalog.js:165-179`);
  - i rituali solo per mago, bardo, chierico e druido
    (`spellbookRitualCastable`, righe 126-135; il commento rimanda Incantatore
    Rituale a un'azione rapida);
  - l'editor cerca con un campo e una `datalist`
    (`initiative-card-modal.html:569-573`, `spellbookSearchOptions`).
- **I trucchetti d'attacco** si lanciano nella console:
  - dal libro (`spellbookAttackAction`, `spellbookCatalog.js:226`);
  - o da un'azione rapida con `source: { kind: "cantrip" }` (`IMPORT_SCHEDA.md`,
    riga 72).

  Tutte e due le strade usano il `spellAttackBonus` e la `spellSaveDC` della
  scheda.
- **Il catalogo:** 477 incantesimi, con livello e scuola, senza liste di classe.
  44 trucchetti, 73 di 1° livello; 15 di 1° fra divinazione e ammaliamento, 6
  fra illusione e necromanzia. I rituali in `spell-reference-it-runtime.json`
  (`ritualIds`) sono 29, 11 di 1° livello.

#### 7.4.3 Il nodo: lo `spellId` sta nella scheda

In F3a l'incantesimo è scritto nella voce. Qui lo sceglie il giocatore e sta in
`feats[].choice`. Due strade:

- **(a) Una voce per ogni scelta possibile**, come «Magia drow: Luminescenza»:
  `talento-contaminazione-fatata-incantesimo-<spellId>`. `featFeaturesForProfile`
  restituisce solo quella scelta; tutti i percorsi restano quelli di F3a.
  - Servono circa 170 voci in più: 73 per Iniziato alla Magia, 73 per Rudimenti
    da Artefice, 15 e 6 per le Contaminazioni. I trucchetti non le richiedono
    (S2).
  - Le voci dello stesso posto condividono un pool:
    `talento-iniziato-alla-magia-incantesimo-usi`.
  - L'azione della voce segue il tempo di lancio dell'incantesimo
    (`castingTime`): Scudo è una reazione, Sonno un'azione.
- **(b) Una voce per posto**, con lo spellId letto dalla scheda al lancio.
  - `speciesSpellOpenRequest` vorrebbe la scheda.
  - Le due chiamate di `initiativeList.js` non l'hanno e dovrebbero leggere il
    token: file delicato, in lavorazione in altre sessioni.

**Raccomandazione: (a).** Non tocca `initiativeList.js`, il pannello né la
console. Il costo è il catalogo, con 170 oggetti congelati.

#### 7.4.4 Trucchetti, CD e attacco

- **I trucchetti scelti** (due di Iniziato alla Magia, quello degli Elfi dei
  Boschi, di Rudimenti da Artefice e di Cecchino Magico) vanno nel libro come
  «Talento: …», sempre pronti, come quelli delle sottoclassi.
  - La console li offre come oggi: Lama rimbombante con l'arma, Dardo di fuoco
    con il tiro.
  - Il pannello li lancia senza slot.
- **CD e attacco del talento.** Un incantesimo che arriva da un talento usa la
  caratteristica del talento, anche lanciato con gli slot. Serve un solo punto
  che dica, per una scheda e un incantesimo, se viene da un talento e con quale
  caratteristica:
  - la console lo usa per il bonus d'attacco e la CD dei trucchetti e degli
    incantesimi d'attacco;
  - il pannello per la CD dei lanci dal libro.

  Oggi tutti e due leggono solo i numeri della scheda: un guerriero con Iniziato
  alla Magia (mago) non ha CD.
- **Una reazione** (Scudo di Iniziato alla Magia) arriva negli avvisi come
  incantesimo lanciabile. L'avviso apre il pannello sul lancio con lo slot; l'uso
  gratis passa dalla card della voce. Resta così: il GM sceglie «Spendi:
  nessuno».

#### 7.4.5 Incantatore Rituale, Cecchino Magico, Telecinesi

- **Incantatore Rituale:**
  - i rituali scelti stanno nel libro come «Talento: Incantatore Rituale», con il
    segno «solo come rituale»;
  - `spellbookRitualCastable` li accetta per qualsiasi classe;
  - il libro non offre il lancio con lo slot;
  - un rituale trovato si aggiunge alla stessa scelta; sopra metà del livello,
    arrotondata per eccesso, la riga avvisa (D8).
- **Cecchino Magico:** un promemoria nella console sui lanci con tiro per
  colpire, come quelli di F1 (`pcAttackTargetNotes`): «gittata doppia, ignora
  copertura media e tre quarti». La console non misura la gittata degli
  incantesimi d'attacco; il pannello la misura solo per quelli che risolve lui
  (`spellTargetRangeMeters`, `spellAreaCatalog.js:808`).
- **Spinta di Telecinesi:** una card con la CD calcolata («TS su Forza CD 14»).
  Il token si sposta a mano: spostamenti e TS al tavolo sono già così per le
  spinte delle manovre.

#### 7.4.6 La scheda e l'import

- **Il riquadro Talenti** mostra sotto la riga del talento solo le sue scelte:
  - la classe, con un menu;
  - i trucchetti e gli incantesimi, con un campo e una `datalist` come il libro,
    filtrati per livello, scuola (le Contaminazioni) e tiro per colpire
    (Cecchino Magico);
  - i rituali, con «+ Rituale».

  Gli avvisi restano avvisi (D8): livello o scuola sbagliati, un rituale sopra
  metà del livello. Le liste di classe restano al GM.
- **Il campo:** `feats[].choice` = `{ classId?, cantripIds?, spellIds? }`.
  - Il sanitizer di F0 tiene già la forma: liste fino a 12 voci, chiavi brevi.
  - Iniziato alla Magia pesa circa 80 byte prima della compressione; il test del
    registro della stanza (F0) va esteso.
- **L'import** (§4.6):
  - `{ "name": "Magic Initiate", "class": "wizard", "cantrips": [...], "spell": "Scudo" }`;
  - `{ "name": "Fey Touched", "ability": "cha", "spells": ["Sortilegio"] }`;
  - `{ "name": "Ritual Caster", "class": "wizard", "rituals": [...] }`.

  Nomi italiani o inglesi, dal catalogo. Livello o scuola sbagliati vanno fra i
  non riconosciuti, mai corretti a indovinare.
- **`docs/IMPORT_SCHEDA.md`:** gli incantesimi scelti dei talenti non vanno più
  nelle Azioni rapide. Il prompt chiede `class`, `cantrips`, `spell`, `spells` e
  `rituals` dentro `feats`.
- **D7:** l'avviso dei doppioni di F3a vale anche per gli incantesimi scelti.

#### 7.4.7 Rischi, come chiede AGENTS.md

| Area | Rischio | Come lo si evita |
|---|---|---|
| Metadata della scheda | `feats[].choice` cresce. | Forma già pulita da F0; misura con la codifica vera della stanza. |
| `initiativeList.js` | La strada (b) lo toccherebbe. | La strada (a) non lo tocca. |
| Pannello incantesimi | La CD dei lanci dal libro cambia per gli incantesimi dei talenti. | Solo per quelli che il libro segna «Talento»; test su un PG senza talenti che restano identici. |
| Console attacchi | Bonus e CD dei trucchetti dei talenti. | Stesso punto unico; le schede senza talenti non cambiano. |
| Catalogo | Circa 170 voci in più in `CLASS_FEATURE_BY_ID`. | Generate da una tabella, congelate; un test conta le voci e controlla gli id. |
| PF | Nessuno: i danni dei trucchetti passano dai comandi di oggi. | — |
| Altre sessioni | Pannello e console sono file condivisi. | Ogni sottolotto si rilegge sul HEAD del momento e si committa con le sole sue righe. |

#### 7.4.8 Sottolotti

| Sottolotto | Contenuto | Tocca |
|---|---|---|
| **F3b-1** | Le due Contaminazioni: l'incantesimo di 1° scelto, con le voci per scelta (21), il selettore filtrato, il libro, l'import di `spells` | `featCatalog.js`, modale, import, test |
| **F3b-2** | Iniziato alla Magia, Rudimenti da Artefice ed Elfi dei Boschi: classe, trucchetti nel libro, incantesimo di 1° (146 voci), il punto unico per CD e attacco nella console e nel pannello | in più `pcAttackCore.js`, `spell-unified-panel.js`, `spellbookCatalog.js` |
| **F3b-3** | Cecchino Magico: classe, trucchetto d'attacco, promemoria nella console | `pcAttackTurnActionCore.js` |
| **F3b-4** | Incantatore Rituale: rituali nel libro, solo come rituali | `spellbookCatalog.js`, il libro della scheda |
| **F3b-5** | La spinta di Telecinesi come card con la CD | `featCatalog.js` |

Ogni sottolotto ha test che falliscono senza la patch, la suite completa in una
copia pulita, le voci in `PROVE_IN_STANZA.md` e la prova al banco.

#### 7.4.9 Decisioni

**Esito:** il 16/11 l'utente le ha approvate tutte come raccomandate («Sì,
approvo»).

| # | Decisione | Possibilità | Raccomandazione |
|---|---|---|---|
| **S1** | Dove nasce lo spellId scelto | (a) una voce per ogni scelta possibile; (b) una voce per posto, spellId dalla scheda | **(a)**: nessun file delicato toccato (§7.4.3). |
| **S2** | I trucchetti scelti | (a) nel libro come «Talento», sempre pronti; (b) voci a volontà fra le capacità, come Mano magica | **(a)**: la console li offre come i trucchetti di classe, armi comprese. |
| **S3** | CD e attacco degli incantesimi dei talenti | (a) quelli del talento, anche con gli slot; (b) quelli della scheda | **(a)**: è la regola, e un guerriero con Iniziato alla Magia non ha CD sulla scheda. |
| **S4** | Liste di classe | (a) nessun controllo: il selettore filtra per livello, scuola e tiro per colpire; (b) liste di classe nuove nel catalogo | **(a)**: le liste sono un lavoro a parte, con dati da importare. |
| **S5** | Iniziato alla Magia con gli slot | (a) sì, se il PG ha slot (Sage Advice); (b) solo l'uso gratis | **(a)**. |
| **S6** | Incantatore Rituale | (a) nel libro, solo come rituale; (b) azioni rapide gratuite come oggi | **(a)**: il libro ha già il lancio rituale. |
| **S7** | Rituali trovati | (a) si aggiungono alla scelta, con l'avviso sopra metà del livello; (b) solo i due iniziali | **(a)**. |
| **S8** | Cecchino Magico e Telecinesi | (a) promemoria nella console e card con la CD; (b) gittata misurata e spinta come azione | **(a)**: niente da misurare né da spostare in automatico. |
| **S9** | Ordine | F3b-1 → F3b-2 → F3b-3 → F3b-4 → F3b-5 | Come proposto: F3b-1 è il più piccolo che va da capo a fondo. |

### 7.5 F3b-1, fatto il 16/11

**L'incantesimo scelto delle Contaminazioni.** Come la §7.4 con S1–S9.

- **Le voci.** Una per candidato,
  `talento-contaminazione-<fatata|ombrosa>-incantesimo-<spellId>`: 19 e 8. Con
  lo stesso pool del posto, `…-incantesimo-usi`, e l'azione dal tempo di lancio:
  Sortilegio è un'azione bonus, Identificare «Speciale». `featFeaturesForProfile`
  restituisce solo quella scelta in `feats[].choice.spellIds`.
- **Le tabelle dei candidati** stanno in `featCatalog.js`. Il catalogo degli
  incantesimi non si può importare lì: arriva a `classFeatureCatalog.js` passando
  da `damageDefensesCore.js`, e quindi tornerebbe al catalogo dei talenti.
  `test/featChosenSpells.test.js` le confronta con il catalogo per tutte e tre le
  fonti:
  - livello e scuola dell'SRD;
  - `italianReference` delle voci del PHB, di Xanathar e di Tasha;
  - i tempi di lancio del compendio.
- **Il lancio** passa da `speciesInnateSpellCore.js`, come in F3a: l'uso del
  posto e la CD del talento. Nel libro l'incantesimo compare come «Talento: …».
- **Nella scheda** c'è un menu con i soli candidati sotto la riga del talento. Un
  incantesimo fuori lista resta, come «Fuori lista: …», con l'avviso (D8). Il
  badge dice l'incantesimo: «Contaminazione Fatata · Car · Sortilegio».
- **Import e doppioni:** `spells` dentro il talento. Un incantesimo fuori lista
  va fra i non riconosciuti. L'avviso dei doppioni (D7) vale anche per
  l'incantesimo scelto.
- **Documenti:** `docs/IMPORT_SCHEDA.md`; le prove in stanza sono in B27 (nata
  come B25, numero che aveva già un'altra lista).

**Una correzione al piano.** La §7.4.2 dava per il catalogo solo livello e
scuola dell'SRD. Le voci fuori dall'SRD hanno scuola, tempo di lancio e rituale
in `italianReference`: per questo i candidati comprendono Sortilegio, Sussurri
Dissonanti, Duello Obbligato, Legame con le Bestie, Incuti Paura e Raggio di
Infermità.

### 7.6 F3b-2, fatto il 16/11

**Iniziato alla Magia, Rudimenti da Artefice e il trucchetto degli Elfi dei
Boschi.** Come la §7.4 con S1–S5.

- **Le voci** (S1). Una per ognuno dei 73 incantesimi di 1° livello del
  catalogo, per Iniziato alla Magia e per Rudimenti da Artefice:
  `talento-<talento>-incantesimo-<spellId>`. Hanno il pool del posto,
  `…-incantesimo-usi`, e l'azione dal tempo di lancio: Scudo è una reazione. Il
  catalogo dei talenti arriva a 257 voci e 14 pool.
- **I trucchetti** (S2) sono una tabella dei 44 del catalogo, `FEAT_CANTRIPS`.
  Quelli scelti vanno nel libro come «Talento: …», sempre pronti, e la console
  li offre come i trucchetti di classe.
- **La caratteristica:**
  - la classe scelta con Iniziato alla Magia dà la sua: Car per bardo,
    stregone e warlock, Sag per chierico e druido, Int per il mago;
  - senza classe, la più alta fra Int, Sag e Car;
  - Rudimenti da Artefice usa sempre l'Int, gli Elfi dei Boschi la Sag.
- **Il punto unico** (S3) è `featSpellcastingAbility(scheda, incantesimo)`: dice
  se un incantesimo viene da un talento e con quale caratteristica.
  - La console lo usa per il bonus d'attacco e la CD (`pcAttackCore.js`).
  - Il pannello lo usa per la CD dei lanci, anche con gli slot
    (`spell-unified-panel.js`).
  - Un incantesimo che è anche nel libro del PG tiene i numeri della scheda. Le
    schede senza talenti non cambiano.
- **Le liste di classe** (S4) non si controllano: i menu offrono tutti i
  trucchetti e tutti gli incantesimi di 1° livello.
- **Gli slot** (S5): l'incantesimo di 1° livello è nel libro come «Talento» e si
  lancia anche con gli slot.
- **Nella scheda**, sotto la riga del talento:
  - i menu «Classe», «Trucchetto 1» e «Trucchetto 2» (uno solo, «Trucchetto»,
    per gli altri due talenti) e «Incantesimo di 1° livello»;
  - il badge dice la classe e l'incantesimo: «Iniziato alla Magia · Mago ·
    Scudo»;
  - un trucchetto fuori dal catalogo resta come «Fuori lista: …», con l'avviso
    (D8).
- **L'import:** `class`, `cantrips` e `spell` dentro il talento. Vanno fra i non
  riconosciuti:
  - una classe fuori lista;
  - un nome che non è un trucchetto;
  - un trucchetto di troppo.
- **Documenti:** `docs/IMPORT_SCHEDA.md`; le prove in stanza sono in B28.

**Una correzione al piano.** La §7.4.8 metteva `spellbookCatalog.js` fra i file
di F3b-2. Il libro invece non è cambiato: i trucchetti scelti passano da
`featGrantedSpells`, che il libro legge già da F3a.

### 7.7 F3b-3, fatto il 16/11

**Cecchino Magico.** Come la §7.4 con S2, S3, S4 e S8.

- **La classe e il trucchetto.** Come Iniziato alla Magia: la classe dà la
  caratteristica, il trucchetto va nel libro come «Talento: Cecchino Magico» e
  la console lo lancia con il bonus del talento (S3).
- **Il menu «Trucchetto con tiro per colpire»** offre gli 11 trucchetti del
  catalogo con un tiro per colpire:
  - gli 8 che la console lancia con un attacco con incantesimo;
  - Pietra Magica, che la console non lancia;
  - le due lame, Lama Roboante e Lama Verdefiamma. **Una scelta fatta nel
    lotto:** il loro lancio è un tiro per colpire con l'arma, e il talento
    chiede solo un trucchetto «che richiede un tiro per colpire».
- **Fuori lista:** un trucchetto senza tiro per colpire (da un client più nuovo)
  resta, con l'avviso, e arriva nel libro: decide il GM (D8). L'import invece lo
  segnala fra i non riconosciuti.
- **Il promemoria** (S8) compare nella console sugli attacchi con incantesimo
  di chi ha il talento, trucchetti e incantesimi di livello:
  - la gittata doppia, in metri: «gittata 72 m invece di 36 m». Non per quelli
    a contatto o personali;
  - per quelli a distanza, «l'attacco ignora mezza copertura e tre quarti di
    copertura»;
  - niente sui TS, sul colpo automatico di Dardo incantato e sulle armi.
- **La gittata resta un promemoria**, come deciso con S8. Il pannello, dove
  misura la gittata dal caster, la tiene semplice; la §5.1 e la §5.5 la davano
  automatica.
- **I file:**
  - il promemoria è `pcAttackSpellSniperNote` in `pcAttackCore.js`;
  - `pcAttackTurnActionCore.js` lo aggiunge alle note dei talenti (F1).
- **Documenti:** `docs/IMPORT_SCHEDA.md`; le prove in stanza sono in B29.

### 7.8 F3b-4, fatto il 16/11

**Incantatore Rituale.** Come la §7.4 con S3, S4, S6 e S7.

- **La scelta:** la classe, come Iniziato alla Magia, e i rituali del libro dei
  rituali in `feats[].choice.ritualIds`, fino a 12.
  - I menu offrono i 33 rituali del catalogo, con il livello: 12 di 1° livello,
    gli altri fino al 6°.
  - La scheda ne mostra due, «Rituale 1» e «Rituale 2»; **+ Rituale** aggiunge
    quelli trovati.
- **Gli avvisi** (S7, D8): un rituale oltre metà del livello del personaggio,
  arrotondata per eccesso, resta, con l'avviso «al massimo 3°». Un id che non è
  un rituale del catalogo resta nella scelta, ma non arriva nel libro.
- **Il libro** (S6). I rituali scelti sono «Talento: Incantatore Rituale · solo
  come rituale»:
  - il pulsante e ⚙ li lanciano senza slot;
  - il 🪄 li offre come «Individuazione del magico (rituale)», anche lui senza
    slot;
  - non contano fra i preparati;
  - `spellbookRitualCastable` li accetta per ogni classe.
- **La console non li elenca.** Un rituale dura 10 minuti in più: non è il
  lancio di un turno, e la preparazione di un'azione non deve offrirli né
  spendere uno slot per loro.
- **Un incantesimo già nel libro del PG** resta suo. Il mago con Individuazione
  del magico nel grimorio la prepara e la lancia con lo slot; i numeri restano
  quelli della scheda.
- **CD e attacco** (S3): quelli della caratteristica della classe scelta, da
  `featSpellcastingAbility`.
- **L'import:** `rituals` dentro il talento, in italiano o in inglese.
  - Un incantesimo che non è un rituale va fra i non riconosciuti.
  - Il livello lo controlla la scheda, con l'avviso.
- **I file:** `featCatalog.js`, `spellbookCatalog.js`, `pcAttackPickerCore.js`,
  la scheda e l'import.
- **Documenti:** `docs/IMPORT_SCHEDA.md`; le prove in stanza sono in B31 (la
  B30 è di un'altra lista, in lavorazione).

### 7.9 F3b-5, fatto il 16/11

**La spinta di Telecinesi.** Come la §7.4 con S8: una card con la CD, il token
spostato a mano.

- **La card** è una seconda voce del talento, `talento-telecinesi-spinta`, come
  il critico di Bisturi da Battaglia:
  - «Telecinesi: spinta telecinetica», azione bonus, solo da leggere;
  - il testo è una riga del plugin, non quella del manuale.
- **La CD** è nella riga «Nel plugin»: «TS su Forza CD 14 (Intelligenza): chi
  lo fallisce si sposta di 1,5 m; il token si sposta a mano.».
  - Vale 8 + competenza + la caratteristica del mezzo talento: quella scelta
    come +1, altrimenti la più alta fra Int, Sag e Car, come per Mano magica.
  - Senza livello o modificatori la riga li chiede.
- **Il catalogo:**
  - una voce di secondo effetto può avere ora la sua azione e il suo TS
    (`featSave`);
  - `featPartSave` calcola la CD, con `abilitySaveDC` di
    `abilityModifiersCore.js`, un modulo senza import.
- **La console** la elenca fra le altre capacità, come azione bonus da leggere.
  La scheda Capacità della console resta com'è: `pcAttackFeatureFormCore.js` è
  in lavorazione in un'altra sessione.
- **Documenti:** le prove in stanza sono in B33.

### 7.10 F4, fatto il 16/11

**Concentrazione.** Come la §5.5 e la tabella dei lotti.

- **L'avviso del TS di concentrazione dopo un danno** dice, accanto al tiro:
  - «vantaggio» se chi si concentra ha Incantatore da Guerra;
  - «svantaggio» se chi ha inflitto il danno ha Sterminatore di Maghi;
  - «vantaggio e svantaggio annullati» con tutti e due;
  - il talento nel suggerimento, mai il nome dell'attaccante: l'avviso arriva
    anche ai giocatori.
- **Il totale del TS di Costituzione:** «TS di Costituzione +5».
  - È quello della scheda, Resiliente compreso; per un mostro importato, il suo
    modificatore.
  - Un PG senza il TS nella scheda non mostra numeri: la competenza la sa la
    scheda.
- **Chi ha colpito** lo dicono le due console. `postBossDamage` riceve
  `sourceId` e lo passa con il danno; `broadcastConcentrationSaveWarnings`
  legge quel token insieme a quello ferito. Il tracker, i PF rapidi, le aree
  del pannello e le reazioni restano come sono: lì lo svantaggio non compare.
- **Il percorso dei dati:**
  - la nota viaggia nella `notice` dell'avviso (`saveHint`), che il tracker
    passa al popup senza toccarla;
  - il normalizzatore di `initiativeList.js` tiene solo i campi suoi, quindi
    quel file non cambia, come promesso dalla tabella dei rischi (§6);
  - il popup ha l'altezza fissa del tracker: la nota sta nella riga che c'era;
  - le aure, che chiedono il TS senza danno, non cambiano.
- **Una cosa per le trasformazioni:** il totale del TS è quello della scheda,
  non della forma. `pcAttackTargetSaveBonus` lo legge dalla forma nella
  sessione delle trasformazioni, non ancora committata. Quando arriva, lo
  stesso vale per questo avviso (`concentrationSaveBonus` in
  `concentrationSaveReminderCore.js`).
- **Documenti:** le prove in stanza sono in B36 (B34 e B35 sono delle
  trasformazioni, in lavorazione).

### 7.11 F5, piano (16/11)

Solo piano: nessun codice. F5 scrive PF, quindi, come chiedono AGENTS.md e la
§9, il piano dice esattamente dove e come; le decisioni H1–H7 sono in fondo.

#### 7.11.1 Che cosa fanno i quattro talenti (PHB 2014, Tasha)

| Talento | Che cosa fa | Nel plugin oggi |
|---|---|---|
| Condottiero Ispiratore | Un discorso di 10 minuti: fino a sei creature amiche entro 9 m, sé compreso, ottengono PF temporanei pari a livello + Carisma. Una creatura non li riottiene prima di un riposo. | Riferimento |
| Cuoco | Nel riposo breve, chi mangia il suo cibo e spende Dadi Vita recupera 1d8 PF in più (fino a 4 + competenza creature). In un'ora, o finito un riposo lungo, prepara delizie pari al bonus di competenza: chi ne mangia una, con un'azione bonus, ottiene PF temporanei pari al bonus di competenza del cuoco. | Riferimento |
| Guaritore | Con un uso della borsa del guaritore, un'azione: la creatura recupera 1d6 + 4 + il suo numero massimo di Dadi Vita, una volta fino al suo riposo. Stabilizzando con la borsa, la creatura torna anche a 1 PF. | Riferimento |
| Tenace | Tirando un Dado Vita per recuperare PF, il minimo per dado è 2 × Costituzione (almeno 2). | Riferimento |

#### 7.11.2 Che cosa c'è già

- **I PF temporanei stanno in `meta.tempHp`** (CAP-TEMP); `meta.hp` arriva fino a
  `meta.hpMax`. `calculateQuickHPChange` non li somma: resta il valore più alto.
- **Il percorso delle capacità che danno PF temporanei.** È `activateClassFeature`
  con `effectPlan.temporaryHp = { amount, applyTo }`:
  - la Tundra dell'Aura Tempestosa e lo spirito dell'Orso del Pastore lo usano;
  - con `applyTo: "selection"` i PF vanno alle creature selezionate sulla mappa
    (nessuna: il personaggio stesso), e un'aura le filtra con la sua gittata
    (`selectedTemporaryHpCreatureIds` in `classFeatureRuntime.js`);
  - è un comando solo: `metadataPatches` su `hp` e `tempHp` con le aspettative
    sui valori del momento, una voce di Cronologia, un Annulla.
  - **Il limite:** gli importi (`classFeatureTemporaryHpAmount`,
    `classFeatureCore.js:1430`) si contano sul livello di classe. Un talento non
    ha classe: per lui torna 0.
- **Le cure e i PF temporanei dei tratti di specie** (`speciesHpTraitCore.js`):
  - Mani guaritrici cura la creatura toccata, con i d4 scritti al tavolo;
  - Scarica di adrenalina dà PF temporanei pari al bonus di competenza;
  - scrivono con `hp:set` in un comando, con l'uso speso nello stesso Annulla
    (`applySpeciesHpTraitResolved` in `classFeatureRuntime.js`);
  - la scheda mostra i loro controlli per ogni voce con `hpTrait`, non solo
    per le specie (`buildSpeciesHpTraitControls`).
- **Il riposo di gruppo** (`group-rest.js`, `groupRestCore.js`) ha per ogni PG il
  campo «PF recuperati con i Dadi Vita»: il GM scrive il totale tirato.
- **Il profilo di un mostro importato** tiene la formula dei PF («8d8 + 16»):
  da lì si leggono i suoi Dadi Vita.
- **I pool delle specie** hanno già la capienza «bonus_competenza». Quelli dei
  talenti oggi conoscono solo numeri fissi (Fortunato: 3): l'aiutante dei pool di
  `featCatalog.js` va esteso per le delizie.

#### 7.11.3 Il piano, talento per talento

- **Condottiero Ispiratore**, una voce «Discorso ispiratore» del talento
  (attivazione «speciale»: 10 minuti):
  - `effectPlan.temporaryHp` con `applyTo: "selection"` e un'aura di 9 m, come
    la Tundra: vanno alle creature selezionate entro 9 m; il personaggio è
    compreso solo se selezionato, o se non c'è altra selezione;
  - l'importo è nuovo: livello totale + modificatore di Carisma;
  - più di sei creature selezionate: il comando si ferma e lo dice, senza
    scegliere al posto del GM;
  - nessuna pill; chi ha già più PF temporanei tiene i suoi.
- **Cuoco**, un pool «Delizie» e una voce «Dai una delizia»:
  - il pool vale il bonus di competenza e si ricarica con il riposo lungo;
    l'ora di cucina è il ↺ del GM sul pool;
  - la voce spende una delizia e dà alla creatura selezionata (nessuna: il
    cuoco) PF temporanei pari al bonus di competenza **del cuoco**;
  - l'azione bonus di chi la mangia resta al tavolo.
- **Guaritore**, una voce «Cura con la borsa», come Mani guaritrici:
  - la creatura selezionata entro 1,5 m (nessuna: il guaritore stesso);
  - cura il d6 scritto dal GM + 4 + i Dadi Vita massimi del bersaglio;
  - i Dadi Vita sono il livello totale per un PG, i dadi della formula dei PF
    per un mostro importato; altrimenti un campo «Dadi Vita del bersaglio» che
    il GM riempie, e senza quel numero il comando si ferma;
  - nessun uso da spendere: la borsa ha 10 usi, che restano al tavolo come la
    stabilizzazione con 1 PF.
- **Tenace**, una nota nel riposo di gruppo, sotto il PG che ha il talento:
  «Tenace: almeno 4 PF per Dado Vita (2 × Costituzione)». Il GM scrive il
  totale come oggi.
- **Il +1d8 del Cuoco**, una nota nel riposo di gruppo quando un PG scelto ha il
  talento: «Cuoco: chi ha mangiato e spende Dadi Vita recupera 1d8 in più (fino
  a N creature)».
- **Resta al tavolo** (§8): «una volta per creatura fino al riposo» di
  Condottiero Ispiratore e Guaritore, chi vede e sente il discorso, la durata
  di 8 ore delle delizie.

#### 7.11.4 Dove si scrive il codice

| File | Che cosa cambia |
|---|---|
| `featCatalog.js` | Le voci «Discorso ispiratore», «Dai una delizia», «Cura con la borsa»; il pool «Delizie», con la capienza pari al bonus di competenza; le righe «Nel plugin» dei quattro talenti. |
| `classFeatureCore.js` | `classFeatureTemporaryHpAmount` accetta due importi sul personaggio intero: livello totale + una caratteristica, e bonus di competenza. Riceve i modificatori della scheda; gli importi di oggi non cambiano. |
| `classFeatureRuntime.js` | Passa i modificatori della scheda al calcolo; il limite di sei creature. **Il file ha righe non committate di un'altra sessione**: il commit prende HEAD + le sole righe di F5. |
| `speciesHpTraitCore.js` | Una cura con un dado qualsiasi (1d6), un più fisso (4) e i Dadi Vita del bersaglio, letti dalla sua scheda. |
| `initiative-card-modal.js` | Il campo «Dadi Vita del bersaglio» della cura, quando serve. |
| `groupRestCore.js`, `group-rest.js` | Le note di Tenace e del Cuoco. |

#### 7.11.5 Rischi, come chiede AGENTS.md

| Area | Rischio | Come lo si evita |
|---|---|---|
| **PF** | F5 scrive `meta.hp` e `meta.tempHp`. | Solo i due percorsi che esistono e sono provati, con le aspettative sui valori del momento: un comando, una voce di Cronologia, un Annulla. Nessun campo nuovo; la cura non supera `hpMax`; i PF temporanei non si sommano. |
| **Barre PF sulla mappa** | Nessuno. | Derivano da `meta.hp` e `meta.tempHp` con la proiezione dopo il commit di oggi; nessun lavoro sugli allegati. |
| **Memoria dei PF dei PG** (`hpMemory.js`) | Nessuno. | La sincronizza la stessa proiezione, come per la Tundra e le Mani guaritrici. |
| **Turno attivo, ordine, loop di metadata** | Nessuno. | Ogni scrittura nasce da un clic; nessun ascoltatore nuovo. |
| **Importi delle capacità di classe** | `classFeatureTemporaryHpAmount` è condiviso. | Gli importi nuovi hanno chiavi nuove; un test controlla che quelli di oggi diano gli stessi numeri. |
| **Altre sessioni** | `classFeatureRuntime.js` è in lavorazione altrove. | Le righe di F5 stanno lontano dalle loro e si committano da sole, con la versione «HEAD + mie righe». |

#### 7.11.6 Sottolotti

| Sottolotto | Contenuto | Scrive PF? |
|---|---|---|
| **F5-1** | Condottiero Ispiratore e le delizie del Cuoco: PF temporanei | Sì, `meta.tempHp` |
| **F5-2** | Guaritore: la cura | Sì, `meta.hp` |
| **F5-3** | Tenace e il +1d8 del Cuoco: note nel riposo di gruppo | No |

Ogni sottolotto ha test che falliscono senza la patch, la suite completa in una
copia pulita, le voci in `PROVE_IN_STANZA.md` e la prova al banco.

#### 7.11.7 Decisioni

**Esito:** il 16/11 l'utente le ha approvate tutte come raccomandate («Sì,
approvo»).

| # | Decisione | Possibilità | Raccomandazione |
|---|---|---|---|
| **H1** | Condottiero Ispiratore | (a) un comando dalla scheda del condottiero, sulle creature selezionate entro 9 m; (b) un pulsante per creatura | **(a)**: il discorso è uno, i PF vanno a tutti insieme, un Annulla. |
| **H2** | Più di sei creature selezionate | (a) il comando si ferma e lo dice; (b) prende le prime sei | **(a)**: chi sono le sei lo sceglie il GM. |
| **H3** | «Una volta per creatura fino al riposo» (Condottiero, Guaritore) | (a) resta al tavolo, come la §8; (b) una pill fino al riposo | **(a)**: niente da segnare a mano, e la §8 l'ha già deciso. |
| **H4** | Le delizie del Cuoco | (a) pool «Delizie» e «Dai una delizia» dalla scheda del cuoco; (b) solo promemoria | **(a)**: sono PF da scrivere, e il pool conta le delizie. |
| **H5** | I Dadi Vita del bersaglio di Guaritore | (a) PG: livello totale; mostro: la formula dei PF; altrimenti il campo; (b) sempre il campo | **(a)**: il GM scrive solo quando la scheda non lo sa. |
| **H6** | Tenace e il +1d8 del Cuoco | (a) note nel riposo di gruppo, il totale lo scrive il GM; (b) un campo per dado con il minimo applicato | **(a)**: il riposo di gruppo chiede il totale, non i singoli dadi. |
| **H7** | Dove nascono gli importi nuovi | (a) nel calcolo comune dei PF temporanei delle capacità (`classFeatureCore.js`), con chiavi nuove; (b) funzioni solo per i talenti in `classFeatureRuntime.js` | **(a)**: un percorso solo, già provato; il file condiviso con l'altra sessione cambia di una riga. |

### 7.12 F5-1, fatto il 16/11

**I PF temporanei: Condottiero Ispiratore e le delizie del Cuoco.** Come la
§7.11 con H1–H4 e H7.

- **Le due voci** sono seconde voci dei talenti, come la spinta di Telecinesi:
  - «Condottiero Ispiratore: discorso», attivazione speciale;
  - «Cuoco: dai una delizia», azione bonus di chi la mangia.

  Hanno l'adattatore «resource-only»: nessuna pill, e `effectPlan.temporaryHp`
  con `applyTo: "targets"`.
- **Il percorso** è quello delle capacità: `activateClassFeature` scrive `hp` e
  `tempHp` con le aspettative sui valori del momento, in un comando, con una
  voce di Cronologia e un Annulla.
- **I bersagli.** Una correzione al piano: invece di un limite nuovo, i
  bersagli delle capacità.
  - `resolveTargetIds` controlla già il numero, la gittata e il personaggio
    stesso quando nessuno è selezionato.
  - Il discorso ha fino a 6 bersagli entro 9 m, il condottiero compreso; la
    delizia uno, senza gittata.
  - Con più di sei creature il messaggio ora dice quante ne servono: «Al
    massimo 6 bersagli: deseleziona quelli in più.» (H2). Quello delle capacità
    a un bersaglio non cambia.
- **Gli importi** (H7). `classFeatureTemporaryHpAmount` accetta
  `{ characterLevel: true, plusAbility: "cha" }` e `{ proficiency: true }`,
  contati sul personaggio intero con i modificatori della scheda.
  - Gli importi di classe non cambiano: un test li confronta.
  - Senza livello o modificatore, `classFeatureTemporaryHpSheetBlocker` ferma il
    comando prima di scrivere.
- **Il pool «Delizie»** vale il bonus di competenza (l'aiutante dei pool dei
  talenti ora accetta «pb») e lo spende la card della delizia, non quella del
  talento (`pool.part`).
- **La riga «Nel plugin»** delle due card dice il numero della scheda: «8 PF
  temporanei (livello 5 + Carisma 3)…». È calcolata nel catalogo, che non può
  importare il calcolo comune; un test controlla che diano lo stesso numero su
  ogni scheda.
- **Il pulsante** delle due card dice «Usa», non «Conferma consumo»: la scheda
  dava a ogni voce «resource-only» un pulsante che spende solo la risorsa
  (`buildResourceOnlyControls`). Le altre voci non cambiano. La console le
  offre già come «Usa», con le creature selezionate.
- **`classFeatureRuntime.js`** ha righe non committate di un'altra sessione: il
  commit prende HEAD + le sei righe di F5-1.
- **Documenti:** le prove in stanza sono in B38 (B37 è delle trasformazioni).

### 7.13 F5-2, fatto il 16/11

**Guaritore: la cura con la borsa.** Come la §7.11 con H3 e H5.

- **La voce** «Guaritore: cura con la borsa» è una seconda voce del talento,
  come Mani guaritrici:
  - la creatura toccata entro 1,5 m, il guaritore stesso se nessuno è
    selezionato;
  - nessun uso da spendere: gli usi della borsa restano al tavolo.
- **Il percorso** è quello dei tratti che cambiano i PF
  (`applySpeciesHpTraitResolved`): `hp:set` in un comando, con le aspettative
  sui valori del momento, una voce di Cronologia e un Annulla. La cura non supera
  i PF massimi; a PF pieni non parte.
- **L'importo:** il d6 scritto dal GM + 4 + i Dadi Vita massimi del bersaglio
  (`planSpeciesHpTrait`, `hpTrait: { kind: "heal", dice: "1d6", plus: 4,
  plusTargetHitDice: true }`).
- **I Dadi Vita** (H5) li dà `speciesTargetHitDice`:
  - per un PG, il livello totale;
  - per un mostro importato con i PF spuntati, i dadi della formula («7d10+21»:
    7);
  - altrimenti il campo «Dadi Vita del bersaglio» della card, o la domanda del
    lancio dal menu. Senza quel numero la cura si ferma.
  
  La scheda viene prima del campo.
- **Il resto non cambia:** `speciesHealDice` accetta un dado fisso («1d6») oltre
  ai d4 di Mani guaritrici; `speciesHpTraitNeedsRoll` lo riconosce, e il menu
  della card del tracker manda alla scheda come per gli altri tiri.
- **`classFeatureRuntime.js`:** solo tre righe, il passaggio di `hitDice`; il
  commit prende HEAD + quelle righe.
- **Documenti:** le prove in stanza sono in B39.

### 7.14 F5-3, fatto il 16/11

**Il riposo di gruppo: Tenace e il cibo del Cuoco.** Come la §7.11 con H6: note,
nessuna scrittura di PF.

- **`groupRestFeatNotes`** (`groupRestCore.js`) legge le schede dei PG della
  scena:
  - **Tenace:** «Tenace: almeno 6 PF per Dado Vita.», cioè 2 × Costituzione,
    almeno 2; senza il modificatore, la regola in parole;
  - **Cuoco:** «Cuoco (Nome): chi ha mangiato il suo cibo e spende Dadi Vita
    recupera 1d8 PF in più, fino a 7 creature.», cioè 4 + il bonus di
    competenza del cuoco.
- **La pagina** (`group-rest.js`):
  - la nota di Tenace sta sotto il PG, come il riepilogo dei PF;
  - quella del Cuoco sta sotto l'elenco, finché il cuoco è fra chi riposa.
  
  Il campo «PF recuperati» resta del GM; il riposo non cambia.
- **Le righe «Nel plugin»** di Tenace e del Cuoco dicono dove sono le note.
- **`groupRestCore.js`** ha righe non committate della sessione delle
  trasformazioni. La funzione nuova sta in fondo al file e gli import in cima,
  lontano dalle loro; il commit prende HEAD + le sole righe di F5-3.
- **Documenti:** le prove in stanza sono in B42 (B40 e B41 sono delle
  trasformazioni).

### 7.15 F6, piano (16/11)

**Reazioni.** Otto talenti in cinque sottolotti. F6-1 si fa subito: usa solo
flussi che esistono e non ha scelte aperte. Gli altri seguono le decisioni
K1–K6 (§7.15.7), approvate il 16/11.

#### 7.15.1 Che cosa fanno (PHB 2014, Xanathar)

| Talento | Che cosa conta per il plugin |
|---|---|
| Duellante Difensivo | Reazione quando lo colpiscono in mischia mentre impugna un'arma accurata: + bonus di competenza alla CA contro quell'attacco. |
| Seconda Possibilità | Reazione quando un attacco con tiro di una creatura che vede lo colpisce: l'attaccante ritira. Un uso fino all'iniziativa o al riposo breve o lungo. |
| Scomparire | Reazione subito dopo un danno: invisibile fino alla fine del suo prossimo turno, o finché non attacca, infligge danni o impone un TS. Un uso per riposo breve o lungo. |
| Sentinella | L'attacco di opportunità che colpisce porta la velocità a 0 per il resto del turno. Il Disimpegno non salva dai suoi attacchi di opportunità. Se una creatura entro 1,5 m attacca un altro, che non ha il talento, attacco in mischia con la reazione. |
| Maestro delle Armi su Asta | Dopo l'azione di Attacco con falcione, alabarda, bastone ferrato o lancia, l'altra estremità come azione bonus (1d4 contundenti). Con falcione, alabarda, picca, bastone ferrato o lancia, chi entra nella portata provoca un attacco di opportunità. |
| Sterminatore di Maghi | Una creatura entro 1,5 m lancia un incantesimo: attacco in mischia con la reazione. Vantaggio ai TS contro gli incantesimi di chi è entro 1,5 m. Lo svantaggio sulla concentrazione è di F4. |
| Incantatore da Guerra | Al posto di un attacco di opportunità, un incantesimo da 1 azione che ha come bersaglio solo quella creatura. Il vantaggio sulla concentrazione è di F4; le componenti somatiche restano al tavolo. |
| Fiamme di Flegesto | Ritira gli 1 dei dadi di fuoco dei suoi incantesimi. Dopo un incantesimo con danni da fuoco, fiamme fino alla fine del suo prossimo turno: chi lo colpisce in mischia entro 1,5 m subisce 1d4 fuoco. |

#### 7.15.2 Che cosa c'è già

- **Gli avvisi di reazione** (`STUDIO_AVVISI_REAZIONE.md`):
  - il catalogo, i candidati e i lotti attivi (`REACTION_PROMPT_LOTS`);
  - i flussi: `use-feature` (risorsa e reazione in un comando),
    `activate-feature` (Tomba di Levistus), `off-turn-attack` (la console fuori
    turno), `note`.
- **I record dei talenti sono già capacità** (D2): una voce
  `source: "class-feature"` con `featureIds: ["talento-…"]` li trova con
  `getEnabledClassFeatures`. Al record serve solo
  `activation.primary = "reazione"`.
- **Le pill su di sé che finiscono con un attacco:** Passo nascosto
  (`endsOnAttack`, letto da `pcAttackLinkEnds`).
- **Le scadenze delle pill delle capacità:** inizio e fine del prossimo turno di
  chi usa la capacità, fine del suo turno. La fine del turno del bersaglio
  esiste solo nel motore della console Boss (`actor: "target"`).
- **Il movimento** (`opportunityAttackCore.js`):
  - `movementReactionEvents`: l'uscita dalla portata e l'entrata nei 3 m
    dell'Alone di Spore;
  - `reactorReachMeters`: la portata letta dalle azioni rapide;
  - il Disimpegno e il Colpo dello Zefiro tolgono ogni attacco di opportunità.
- **Le ritorsioni sul colpo:** le pill con `mechanics.retaliation`, come Scudo di
  fuoco. Il pulsante sotto il bersaglio applica il danno all'attaccante
  (`applyRetaliationDamage`).
- **La console attacchi:**
  - attivazioni con `requires.reaction` (solo fuori dal proprio turno) ed
    effetti con pill;
  - le armi dei talenti (gli artigli di Pelle di Drago) e i seguiti
    (`pcAttackFollowUps`).
- **Il pannello incantesimi** ferma il lancio per Controincantesimo, Nemesi e
  Ladro di incantesimi. Non sa aprire la console fuori turno.

#### 7.15.3 Il piano, talento per talento

- **Duellante Difensivo (F6-1):**
  - voce `defensive-duelist`: colpito in mischia con tiro, prima del danno;
  - `ac-bonus` pari al bonus di competenza;
  - Usa segna la reazione.

  L'arma accurata e «vede» restano al GM.
- **Seconda Possibilità (F6-1):**
  - voce `second-chance`: colpito da un attacco con tiro, prima, `reroll`;
  - Usa spende l'uso e la reazione.

  L'uso torna col riposo breve o lungo. Per i pool non c'è un evento «tiro
  d'iniziativa»: all'iniziativa lo rimette il GM con ↺.
- **Scomparire (F6-1):**
  - una seconda voce del talento, con la pill «Invisibile · Scomparire» su di
    sé fino alla fine del suo prossimo turno, `endsOnAttack` e l'uso del
    talento;
  - voce `fade-away`: danno, dopo, `activate-feature`.

  I danni inflitti e i TS imposti senza un attacco dalla console restano al
  GM, come per Passo nascosto.
- **Sentinella (F6-2):**
  - `movementReactionEvents`: il Disimpegno non toglie gli attacchi di
    opportunità di un reattore con Sentinella; il Colpo dello Zefiro sì, perché
    non è un Disimpegno;
  - la velocità 0: un'attivazione della console, «Sentinella: velocità 0», sui
    colpi in mischia fuori dal proprio turno (`requires.reaction`). La pill ha
    `setMeters: 0` fino alla fine del turno del bersaglio (K1);
  - l'attacco per un altro: voce `sentinel-strike`, colpito e mancato, dopo,
    `protects: "other"` entro 1,5 m, console fuori turno. Niente se il
    bersaglio attaccato ha Sentinella (K2).
- **Maestro delle Armi su Asta (F6-3):**
  - la portata: una scelta del talento, «arma con portata 3 m» (falcione,
    alabarda, picca). `reactorReachMeters` la legge, e vale anche per l'uscita
    (K3);
  - l'entrata: un innesco nuovo, «entra nella portata», calcolato da
    `movementReactionEvents` come l'uscita, con Disimpegno e Zefiro. La voce
    apre la console fuori turno;
  - l'altra estremità: un'arma del talento nella card (1d4 contundenti, Forza),
    come gli artigli di Pelle di Drago, e il seguito nella console.
- **Sterminatore di Maghi (F6-4):**
  - voce `mage-slayer`: incantesimo lanciato entro 1,5 m, console fuori turno con
    il lanciatore selezionato;
  - il pannello impara il flusso: Usa apre la console del reattore e il lancio
    aspetta, come per Controincantesimo (K4);
  - il vantaggio ai TS resta nella riga «Nel plugin» (K5).
- **Incantatore da Guerra (F6-4):** nell'avviso dell'attacco di opportunità, la
  riga «o un incantesimo da 1 azione solo su di lei». Usa apre la console fuori
  turno, come per l'attacco.
- **Fiamme di Flegesto (F6-5):**
  - una seconda voce del talento, «Fiamme di Flegesto: fiamme», con la pill su di
    sé fino alla fine del suo prossimo turno;
  - sulla pill la ritorsione 1d4 fuoco in mischia entro 1,5 m
    (`mechanics.retaliation`, come Scudo di fuoco);
  - il GM la usa dopo un incantesimo di fuoco (K6).

  «Ritira gli 1» resta un promemoria nella riga.

#### 7.15.4 Dove si scrive il codice

- **I file:**
  - `featCatalog.js`: record, scelte, righe;
  - `reactionTriggerCatalog.js` e `reactionPromptView.js`: voci, lotto F6,
    testi;
  - `opportunityAttackCore.js` e `reactionCandidatesCore.js`: F6-2 e F6-3;
  - `pcAttackActivationCatalog.js` e `classFeatureCore.js`: la velocità 0 e la
    sua scadenza (F6-2);
  - `pcAttackCore.js`: il seguito (F6-3);
  - `reaction-move.js` e `spell-unified-panel.js`: F6-4.
- **Le righe di altre sessioni:** `reactionPromptView.js` e
  `spell-unified-panel.js` ne hanno di non committate. Il commit prende HEAD +
  le righe del lotto.

#### 7.15.5 Rischi, come chiede AGENTS.md

| Area | Rischio | Come lo si evita |
|---|---|---|
| **PF** | Nessun lotto li scrive. | Fiamme di Flegesto usa il pulsante della ritorsione che c'è: un clic del GM, un comando, un Annulla. |
| **Turno attivo, ordine, id virtuali** | Nessuno. | L'osservatore del movimento legge lo stato come oggi. |
| **Metadata** | La scelta della portata in `feats[].choice`. | Unita alla scheda; pill e risorse dai flussi che esistono; nessuna chiave nuova. |
| **Velocità** | La pill di Sentinella. | `setMeters: 0`, che lo Speed Tracker legge già. |
| **Motore delle pill** | Una scadenza nuova: la fine del turno del bersaglio. | Il motore la conosce già dalla console Boss (`actor: "target"`); cambia solo il record della capacità. |
| **`initiativeList.js`** | — | Non cambia. |

#### 7.15.6 Sottolotti

| Lotto | Contenuto | Scrive PF? |
|---|---|---|
| **F6-1** | Duellante Difensivo, Seconda Possibilità, Scomparire | No |
| **F6-2** | Sentinella: Disimpegno, velocità 0, attacco per un altro | No |
| **F6-3** | Maestro delle Armi su Asta: portata, entrata, altra estremità | No |
| **F6-4** | Sterminatore di Maghi nel pannello; Incantatore da Guerra nell'avviso dell'attacco di opportunità | No |
| **F6-5** | Fiamme di Flegesto | No: la ritorsione usa il pulsante che c'è |

#### 7.15.7 Decisioni

**Esito:** il 16/11 l'utente le ha approvate tutte come raccomandate («Approvo,
vai con F6-2»). F6-1 non ne dipende.

| # | Decisione | Possibilità | Raccomandazione |
|---|---|---|---|
| **K1** | La velocità 0 di Sentinella | (a) un'attivazione nella console sui colpi in mischia fuori turno, spuntata dal GM; (b) automatica su ogni colpo fuori turno; (c) un promemoria | **(a)**: la console non sa se l'attacco è di opportunità. L'attacco di Sentinella per un altro non lo è, e lo sa solo il GM. |
| **K2** | L'attacco per un altro | (a) avviso dopo il colpo e dopo il mancato, con gli interruttori Colpito e Mancato; (b) solo dopo il colpo | **(a)**: il talento vale per ogni attacco, che colpisca o no. |
| **K3** | La portata di Maestro delle Armi su Asta | (a) una scelta del talento nella scheda, che vale anche per l'uscita; (b) la portata scritta nelle azioni rapide | **(a)**: le azioni rapide dei PG non hanno il campo della portata. |
| **K4** | Sterminatore di Maghi nel pannello | (a) al clic del lancio, come Controincantesimo: Usa apre la console e il lancio aspetta il secondo clic; (b) dopo il lancio | **(a)**: il pannello oggi si ferma solo lì. Il GM può registrare l'attacco dopo il lancio. |
| **K5** | Il vantaggio ai TS di Sterminatore di Maghi | (a) nella riga «Nel plugin»; (b) una nota accanto al TS nel pannello | **(a)**: il pannello è in lavorazione in altre sessioni; (b) si può aggiungere dopo. |
| **K6** | Le fiamme | (a) la card della seconda voce, usata dal GM dopo l'incantesimo; (b) un'offerta nel pannello dopo un incantesimo di fuoco | **(a)**: niente da cambiare nel pannello; dopo, la ritorsione compare da sola. |

### 7.16 F6-1, fatto il 16/11

**Tre reazioni con i flussi che esistono.** Come la §7.15.

- **Duellante Difensivo:**
  - voce `defensive-duelist`: colpito in mischia con tiro, prima del danno;
  - il record del talento usa la reazione (`activation: "reazione"`);
  - l'avviso conta la CA con il bonus di competenza del livello: «CA 15 → 18:
    un tiro da 15 a 17 diventa Mancato»;
  - Usa segna «Reazione usata».
- **Seconda Possibilità:**
  - voce `second-chance`: colpito da un attacco con tiro, prima, `reroll`;
  - un uso (`talento-seconda-possibilita-uso-usi`), di nuovo col riposo breve o
    lungo; senza uso l'avviso non c'è;
  - Usa spende l'uso e la reazione in un comando.
- **Scomparire:**
  - la seconda voce `talento-scomparire-invisibile` usa la reazione e l'uso
    del talento (`talento-scomparire-uso-usi`);
  - la pill «Invisibile · Scomparire» sta su di sé fino alla fine del suo
    prossimo turno, e finisce se attacca dalla console (`endsOnAttack`);
  - voce `fade-away`: danno, dopo, `activate-feature`.
- **Il catalogo dei talenti** impara `activation` della card e, per la pill di
  una seconda voce, `self`, `label`, `kind` ed `endsOnAttack`.
- **`REACTION_PROMPT_LOTS`** ha «F6».
- **`reactionPromptView.js`** ha righe non committate delle trasformazioni (la
  CA della forma): il commit prende HEAD + le righe di F6-1.
- **Documenti:** le prove in stanza sono in B44 (B43 è delle trasformazioni).

### 7.17 F6-2, fatto il 16/11

**Sentinella.** Come la §7.15, con K1 e K2.

- **Il Disimpegno** (`opportunityAttackCore.js`): chi si disimpegna non provoca
  attacchi di opportunità, tranne quelli di un reattore con Sentinella. Il
  Colpo dello Zefiro non è un Disimpegno: con la sua pill non reagisce nessuno.
- **La velocità 0:**
  - una seconda voce del talento, `talento-sentinella-velocita-zero`, con la
    pill «Velocità 0 · Sentinella» (`setMeters: 0`);
  - un'attivazione della console sui colpi in mischia fuori dal proprio turno
    (`requires.reaction`), con il suggerimento «Solo con un attacco di
    opportunità»: la spunta il GM (K1);
  - la scadenza nuova `target-turn-end` (`classFeatureCore.js`): la pill finisce
    con il turno del bersaglio, quello in corso, come le pill della console Boss
    (`actor: "target"`). Il modale della card la chiama «fino alla fine del
    turno del bersaglio».
- **L'attacco per un altro** (K2):
  - voce `sentinel-strike`: colpito e mancato, dopo, una creatura ostile entro
    1,5 m che attacca un altro;
  - Usa apre la console fuori turno con l'attaccante selezionato;
  - `unlessProtectedHasFeature` (`reactionCandidatesCore.js`) la toglie se il
    bersaglio attaccato ha anche lui Sentinella;
  - la riga dell'avviso dice «Attacco in mischia contro Orco», cioè contro chi
    ha attaccato, e non «su» chi è stato attaccato (`reactionPromptEffectText`).
    Gli altri testi non cambiano.
- **La riga «Nel plugin»** di Sentinella dice dove sta ogni parte.
- **`reactionPromptView.js`** ha righe non committate delle trasformazioni: il
  commit prende HEAD + le righe di F6-2.
- **Documenti:** le prove in stanza sono in B46 (B45 è delle trasformazioni).

### 7.18 F6-3, fatto il 16/11

**Maestro delle Armi su Asta.** Come la §7.15, con K3.

- **La portata:**
  - nel riquadro Talenti della scheda, il menu «Portata dell'arma»: 1,5 m
    (bastone ferrato, lancia) o 3 m (falcione, alabarda, picca);
  - si salva solo i 3 m (`choice.reachMeters`);
  - `reactorReachMeters` la legge, quindi vale anche per chi esce dalla
    portata.
- **L'entrata nella portata:**
  - un innesco nuovo, `move-enter-reach`, con l'interruttore Movimento:
    `movementReactionEvents` lo calcola come l'uscita, casella per casella, ma
    solo per chi ha il talento;
  - il Disimpegno e il Colpo dello Zefiro lo tolgono. L'eccezione di Sentinella
    parla dell'uscita dalla portata, quindi qui non vale;
  - voce `polearm-master-reach`: «Orco entra nella portata», Usa apre la console
    fuori turno con chi è entrato selezionato. La velocità 0 di Sentinella vale
    anche qui, perché è un attacco di opportunità.
- **L'altra estremità:**
  - un'arma del talento, «Altra estremità dell'arma» (1d4 contundenti +
    Forza), che la card aggiunge agli Attacchi come gli artigli di Pelle di
    Drago;
  - dopo un attacco in mischia la console ricorda l'azione bonus
    (`pcAttackFollowUps`), non dopo l'altra estremità stessa.
- **L'import della scheda:** `reach` (o `portata`), in metri o in piedi: 3 m o
  10 ft salvano la scelta; 1,5 m è il valore di base; un altro valore, o una
  portata per un altro talento, viene segnalato. `IMPORT_SCHEDA.md` lo dice.
- **`pcAttackCore.js`** ha righe non committate di un'altra sessione: il commit
  prende HEAD + le righe di F6-3.
- **Documenti:** le prove in stanza sono in B47.

### 7.19 F6-4, fatto il 16/11

**Sterminatore di Maghi e Incantatore da Guerra.** Come la §7.15, con K4 e K5.

- **Sterminatore di Maghi** (K4):
  - voce `mage-slayer`: una creatura ostile entro 1,5 m lancia un incantesimo,
    trucchetti compresi; avviso al clic del lancio nel pannello incantesimi,
    come Controincantesimo;
  - il pannello impara il flusso `off-turn-attack`: Usa apre la console attacchi
    del reattore fuori turno, e il lancio parte al clic successivo;
  - la selezione della mappa resta com'è, perché i bersagli del pannello la
    seguono: selezionare il lanciatore cambierebbe i bersagli dell'incantesimo.
    Il GM sceglie il lanciatore come bersaglio nella console, e il messaggio del
    pannello lo dice. È l'unica differenza dal piano, che diceva «con il
    lanciatore selezionato».
  - il vantaggio ai TS contro gli incantesimi vicini resta nella riga «Nel
    plugin» (K5).
- **Incantatore da Guerra:**
  - le voci degli attacchi di opportunità (`opportunity-attack`,
    `polearm-master-reach`) hanno `opportunityAttack`;
  - per un reattore con il talento la loro riga dice «…, o un incantesimo da 1
    azione solo su di lei (Incantatore da Guerra)»; Usa apre la console fuori
    turno, come per l'attacco;
  - l'avviso del movimento mostra la riga sotto l'attacco di opportunità solo
    quando dice più dell'attacco.
- **Le righe «Nel plugin»** dei due talenti dicono dove sta ogni parte, anche
  quelle di F4.
- **`reactionPromptView.js` e `spell-unified-panel.js`** hanno righe non
  committate di altre sessioni: il commit prende HEAD + le righe di F6-4.
- **Documenti:** le prove in stanza sono in B48.

### 7.20 F6-5, fatto il 16/11

**Fiamme di Flegesto.** Come la §7.15, con K6. Con F6-5 il lotto F6 è chiuso.

- **Le fiamme:**
  - una seconda voce del talento, «Fiamme di Flegesto: fiamme», senza usi: il GM
    la usa dopo un incantesimo con danni da fuoco (K6), dal menu della card o
    dalla scheda Capacità della console;
  - la pill «Fiamme di Flegesto» sta su di sé fino alla fine del suo prossimo
    turno.
- **La ritorsione:**
  - la pill porta `mechanics.retaliation` (1d4 fuoco, solo in mischia, entro
    1,5 m), come Scudo di fuoco: il catalogo dei talenti ora accetta una
    ritorsione accanto al movimento;
  - le console la mostrano sotto il bersaglio colpito in mischia, con il
    pulsante che applica il danno all'attaccante (`applyRetaliationDamage`, un
    comando, un Annulla). Niente PF scritti senza il clic del GM.
- **Al tavolo:** ritirare gli 1 dei dadi di fuoco e la luce delle fiamme.
- **La riga «Nel plugin»** lo dice.
- **Documenti:** le prove in stanza sono in B49.

### 7.21 F9, piano (16/11)

**Capacità prese in prestito.** Cinque talenti in quattro sottolotti. Nessuna
decisione nuova: la §5.5 dice già come; per i prerequisiti vale D8 (avvisi,
mai blocchi), per i pool D14 (quelli del talento, separati da quelli della
classe).

#### 7.21.1 Che cosa fanno (PHB 2014, Xanathar, Tasha)

| Talento | Che cosa conta per il plugin |
|---|---|
| Adepto Marziale | Due manovre del Maestro di Battaglia e un dado di superiorità d6, di nuovo col riposo breve o lungo; la CD dei TS è 8 + competenza + Forza o Destrezza. |
| Adepto di Metamagia | Due opzioni di metamagia e 2 punti stregoneria solo per la metamagia, di nuovo col riposo lungo. |
| Adepto Occulto | Una supplica occulta; una con prerequisiti solo per un warlock che li soddisfa. |
| Rudimenti da Guerriero | Uno stile di combattimento del guerriero. |
| Paura Draconica | Al posto del soffio, il ruggito: le creature scelte entro 9 m tirano un TS Saggezza (CD 8 + competenza + Carisma) o sono spaventate per 1 minuto, e ripetono il TS quando subiscono danni. Spende l'uso del soffio. |

#### 7.21.2 Il meccanismo comune: le opzioni prese in prestito

- **Il talento dice da dove prende le opzioni:** il record padre della classe
  (lo stile del guerriero, le suppliche, la metamagia, le manovre) e quante.
- **La scheda salva le scelte corte:** la parte finale dell'id, in
  `choice.optionIds` (`["difesa"]`), per il budget del registro della stanza.
- **Ogni opzione diventa una card del talento,** per esempio «Rudimenti da
  Guerriero: Difesa» (`talento-rudimenti-da-guerriero-difesa`):
  - nome, manuale, pagina e attivazione vengono dal record della classe;
  - il testo è quello dell'opzione (`sourceFeatureId`);
  - nella scheda ci sono solo le opzioni scelte.
- **La costruzione sta in `classFeatureCatalog.js`:** il catalogo dei talenti
  non importa quello delle classi (1,4 MB), che arriverebbe nei moduli leggeri.
- **Nella scheda** un menu per opzione; **nell'import** una chiave per nome.

#### 7.21.3 Sottolotti

| Lotto | Contenuto | Scrive PF? |
|---|---|---|
| **F9-1** | Il meccanismo; Rudimenti da Guerriero (i sei stili del catalogo) e Adepto Occulto (le 46 suppliche), card di riferimento; Protezione con «Usa reazione». L'avviso (D8) per una supplica oltre il livello da warlock. | No |
| **F9-2** | Adepto di Metamagia: le due opzioni come card che spendono i 2 punti del talento, con i costi dello stregone (D14). | No |
| **F9-3** | Adepto Marziale: le due manovre con il d6 del talento, nella console sul colpo, negli avvisi (Parata, Replica) e come card per le altre; CD con Forza o Destrezza. | No |
| **F9-4** | Paura Draconica: il ruggito come opzione del soffio nella console, creature scelte a mano, Spaventato per 1 minuto con il TS ripetuto quando subisce danni; spende l'uso del soffio. | No |

#### 7.21.4 Rischi, come chiede AGENTS.md

- **PF:** nessun sottolotto li scrive.
- **Metadata:** `choice.optionIds`, corti, uniti alla scheda; nessuna chiave
  nuova.
- **Il catalogo delle classi** resta com'è: le card del talento sono record
  nuovi, `talento-…`.
- **Gli stili di Tasha** non sono nel catalogo: Rudimenti da Guerriero offre i
  sei del Manuale del Giocatore.
- **Righe di altre sessioni:** `classFeatureCatalog.js`, `pcAttackCore.js`,
  `pcAttackExecution.js` e `pcAttackPickerCore.js` ne hanno di non
  committate. Il commit prende HEAD + le righe del sottolotto.

### 7.22 F9-1, fatto il 16/11

**Rudimenti da Guerriero e Adepto Occulto.** Come la §7.21.

- **Il meccanismo:**
  - nel catalogo dei talenti, `borrowed`: il record padre della classe e quante
    opzioni; nella scheda, `choice.optionIds`;
  - in `classFeatureCatalog.js`, le card del talento (`FEAT_OPTION_FEATURES`:
    52, sei stili e 46 suppliche), copiate dai record della classe, con
    `featOption` e `sourceFeatureId`;
  - `getFeatFeatures` aggiunge solo quelle scelte.
- **Il testo** della card è quello dell'opzione, dall'SRD o dal pacchetto
  (`classFeatureDescription`), come per la classe.
- **La scheda:**
  - nei Talenti, il menu «Stile di combattimento» o «Supplica occulta»; accanto
    alle suppliche dal 5° livello in su c'è il livello;
  - l'avviso (D8) quando la supplica chiede un livello da warlock più alto.
- **L'import:** `style`/`stile` e `invocation`/`supplica` (o `options`), per
  nome italiano. `IMPORT_SCHEDA.md` lo dice.
- **Le card sono di riferimento,** come quelle della classe. Protezione usa la
  reazione: «Usa reazione» nella console.
- **`classFeatureCatalog.js`** ha righe non committate delle trasformazioni: il
  commit prende HEAD + le righe di F9-1.
- **Documenti:** le prove in stanza sono in B50.

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
