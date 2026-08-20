# CF-001 / CF-001B — SOURCE OF TRUTH & AUDIT CAPACITÀ DI CLASSE

## 1. Executive Summary & Documentation Governance

Il presente documento costituisce il **Report Narrativo Autorevole** per l'inventario, lo stato corrente e lo stato target delle capacità di classe nel plugin Owlbear Rodeo **Take Initiative!** (v1.3.0).

### Ownership e Ruoli dei Documenti:
- **`data/class-features/class-feature-automation-audit.json`**: **Source of Truth Canonica Machine-Readable** (generata deterministicamente da `npm run audit:class-features`).
- **`scripts/audit-class-features.mjs`**: **Generatore Canonico** che assicura la perfetta riproducibilità senza script scratch esterni.
- **`docs/AUDIT_CAPACITA_CLASSE.md`**: **Output Tecnico Generato** ad ogni esecuzione dell'audit script.
- **`docs/CLASS_FEATURE_AUDIT.md`**: **Report Narrativo Autorevole** e guida interpretativa dei percorsi e microbatch futuri.

L'audit è stato eseguito in modalità **READ-ONLY**, con una baseline di **1788 test passanti (0 fallimenti)** e build di produzione verificata.

### Metriche Globali Reconciliate

- **Classi totali**: **13** (12 PHB 2014 + 1 UA *Ranger Revised 2016*)
- **Sottoclassi totali**: **100**
- **Record totali nel database sorgente (`data/class-features/class-feature-automation-audit.json`)**: **860**
- **Feature nel catalogo runtime (`src/class-features-runtime.json`)**: **551**
  - **Implemented (Automate / Assistite)**: **59**
  - **Not Automated (Reference / Manuali / Reminder)**: **492**
- **Feature non esposte nel catalogo runtime (solo DB sorgente)**: **309**

### Ripartizione Automation: Current vs Target

| Livello | Current Automation (Runtime Truth) | Target Automation (Intended / Curata) |
|---|---:|---:|
| **FULL** | 8 | 30 |
| **PARTIAL** | 41 | 383 |
| **TRACK_ONLY** | 147 | 87 |
| **MANUAL** | 630 | 360 |
| **NONE** | 34 | 0 |
| **UNREVIEWED** | 0 | 0 |
| **TOTALE** | **860** | **860** |

### Ripartizione Gap e Coverage Reconciliata

- **Coverage Status**:
  - **ACCEPTED**: **398** (capacità in cui `currentAutomationLevel` soddisfa il `targetAutomationLevel`)
  - **GAP (Functional)**: **462** (capacità in cui il target curato prevede automazione/assistenza/tracciamento non ancora presente a runtime)
  - **UNREVIEWED**: **0**
- **Test Coverage Status**:
  - **DIRECT**: **136**
  - **INDIRECT**: **28**
  - **NONE**: **696**
- **Test Gap Count**: **4** (capacità `implemented` a runtime prive di direct regression test in `test/`, severità `P3`)
- **Source Conflict Count**: **3** (`chierico-dominio-della-vita-incanalare-divinita-preservare-vita`, `guerriero-recuperare-energie`, `ladro-assassino-assassinare`)
- **Catalog Gap Count**: **0** (tutte le 860 feature sono correttamente classificate come `CATALOGED` nei dataset PHB, XGE, TCE o Ranger Revised)
- **Custom Code Features**: **15**
- **Persistent / Aura Lifecycle Features**: **68**
- **Resource Pools**: **104**

---

## 2. Schema della Source of Truth

Tutti gli 860 record sono persistiti in un unico file canonico:
[class-feature-automation-audit.json](file:///c:/Progetti/obr-initiative/data/class-features/class-feature-automation-audit.json)

Ogni record include:
- `classId`, `className`, `subclassId`, `subclassName`, `featureId`, `featureName`
- `catalogStatus`: `CATALOGED` | `CATALOG_GAP` | `SOURCE_CONFLICT`
- `runtimeExposed`: `true` | `false`
- `currentAutomationLevel`: `FULL` | `PARTIAL` | `TRACK_ONLY` | `MANUAL` | `NONE`
- `targetAutomationLevel`: `FULL` | `PARTIAL` | `TRACK_ONLY` | `MANUAL` | `UNREVIEWED`
- `coverageStatus`: `ACCEPTED` | `GAP` | `UNREVIEWED`
- `testCoverageStatus`: `DIRECT` | `INDIRECT` | `NONE`
- `testGap`: boolean
- `sourceConflict`: boolean (con `sourceConflictDetails`)
- `currentUiExposure`: `PANEL` | `TRACKER` | `UNIFIED` | `REFERENCE_ONLY` | `HIDDEN` | `NONE`
- `executionPath`: Array di enum (`CUSTOM_CODE`, `AURA`, `EFFECTS_MUTATION`, `RESOURCE_ONLY`, `SPELL_ADAPTER`, `REMINDER`, `PASSIVE`, `GENERIC`, `NONE`)
- `resourceModel`: `NONE` | `USES` | `DICE_POOL` | `POINT_POOL` | `SHORT_REST` | `LONG_REST` | `OTHER`
- `activationType`: `ACTION` | `BONUS_ACTION` | `REACTION` | `PASSIVE` | `FREE` | `ON_TURN_START` | `ON_TURN_END` | `OTHER` | `UNKNOWN`
- `targetingMode`: `SELF` | `SINGLE_TARGET` | `MULTI_TARGET` | `AREA` | `AURA` | `NO_TARGET` | `MANUAL` | `UNKNOWN`
- `durationMode`: `INSTANT` | `ROUND_BASED` | `UNTIL_TURN` | `UNTIL_REST` | `TOGGLE` | `PERSISTENT` | `NONE`
- `persistentCategory`: `SPATIAL_AURA` | `ROUND_STATE` | `TURN_BOUND_STATE` | `TOGGLE_STATE` | `PERSISTENT_EFFECT` | `null`
- `usesCustomCode`, `hasCleanup`, `hasDirectTest`
- `gapCategory`, `severity`, `evidence`, `notes`

---

## 3. Class Coverage Summary

| Classe | ID | Sottoclassi | Feature Totali | FULL | PARTIAL | TRACK_ONLY | MANUAL | NONE | ACCEPTED | GAP | UNREVIEWED |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Barbaro | `barbaro` | 7 | 68 | 5 | 15 | 3 | 45 | 0 | 37 | 31 | 0 |
| Bardo | `bardo` | 7 | 46 | 1 | 4 | 13 | 28 | 0 | 20 | 26 | 0 |
| Chierico | `chierico` | 12 | 78 | 1 | 2 | 16 | 56 | 3 | 39 | 39 | 0 |
| Druido | `druido` | 7 | 56 | 0 | 0 | 12 | 42 | 2 | 28 | 28 | 0 |
| Guerriero | `guerriero` | 8 | 93 | 0 | 0 | 17 | 65 | 11 | 33 | 60 | 0 |
| Ladro | `ladro` | 9 | 63 | 0 | 3 | 7 | 53 | 0 | 36 | 27 | 0 |
| Mago | `mago` | 11 | 61 | 0 | 0 | 10 | 51 | 0 | 35 | 26 | 0 |
| Monaco | `monaco` | 8 | 79 | 0 | 0 | 16 | 50 | 13 | 27 | 52 | 0 |
| Paladino | `paladino` | 7 | 56 | 0 | 12 | 11 | 30 | 3 | 23 | 33 | 0 |
| Ranger | `ranger` | 7 | 65 | 0 | 0 | 5 | 60 | 0 | 36 | 29 | 0 |
| Stregone | `stregone` | 7 | 56 | 1 | 3 | 22 | 30 | 0 | 27 | 29 | 0 |
| Warlock | `warlock` | 7 | 94 | 0 | 0 | 15 | 77 | 2 | 55 | 39 | 0 |
| Ranger (Revised) | `ranger-revised` | 3 | 45 | 0 | 2 | 0 | 43 | 0 | 2 | 43 | 0 |

---

## 4. Subclass Coverage Summary (Estratto delle 100 Sottoclassi)

| Sottoclasse | ID | Classe | Feature | FULL | PARTIAL | TRACK_ONLY | MANUAL | NONE | ACCEPTED | GAP | UNREVIEWED |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Cammino del Berserker | `barbaro-cammino-del-berserker` | `barbaro` | 4 | 1 | 1 | 0 | 2 | 0 | 3 | 1 | 0 |
| Cammino del Combattente Totemico | `barbaro-cammino-del-combattente-totemico` | `barbaro` | 14 | 1 | 5 | 0 | 8 | 0 | 10 | 4 | 0 |
| Cammino del Guardiano Ancestrale | `barbaro-cammino-del-guardiano-ancestrale` | `barbaro` | 4 | 1 | 0 | 1 | 2 | 0 | 1 | 3 | 0 |
| Cammino dell'Araldo della Tempesta | `barbaro-cammino-dell-araldo-della-tempesta` | `barbaro` | 7 | 0 | 2 | 0 | 5 | 0 | 1 | 6 | 0 |
| Cammino della Bestia | `barbaro-cammino-della-bestia` | `barbaro` | 7 | 0 | 2 | 1 | 4 | 0 | 2 | 5 | 0 |
| Cammino della Magia Selvaggia | `barbaro-cammino-della-magia-selvaggia` | `barbaro` | 13 | 0 | 4 | 1 | 8 | 0 | 4 | 9 | 0 |
| Cammino dello Zelota | `barbaro-cammino-dello-zelota` | `barbaro` | 5 | 0 | 1 | 0 | 4 | 0 | 3 | 2 | 0 |
| Collegio dei Sussurri | `bardo-collegio-dei-sussurri` | `bardo` | 4 | 0 | 0 | 3 | 1 | 0 | 1 | 3 | 0 |
| Collegio del Valore | `bardo-collegio-del-valore` | `bardo` | 4 | 0 | 0 | 1 | 3 | 0 | 2 | 2 | 0 |
| Collegio dell'Eloquenza | `bardo-collegio-dell-eloquenza` | `bardo` | 5 | 0 | 3 | 0 | 2 | 0 | 1 | 4 | 0 |
| Collegio dell'Incanto | `bardo-collegio-dell-incanto` | `bardo` | 4 | 0 | 0 | 3 | 1 | 0 | 0 | 4 | 0 |
| Collegio della Creazione | `bardo-collegio-della-creazione` | `bardo` | 4 | 0 | 0 | 3 | 1 | 0 | 0 | 4 | 0 |
| Collegio della Sapienza | `bardo-collegio-della-sapienza` | `bardo` | 4 | 0 | 0 | 2 | 2 | 0 | 2 | 2 | 0 |
| Collegio delle Spade | `bardo-collegio-delle-spade` | `bardo` | 10 | 0 | 0 | 1 | 9 | 0 | 3 | 7 | 0 |
| Dominio del Crepuscolo | `chierico-dominio-del-crepuscolo` | `chierico` | 7 | 1 | 1 | 0 | 5 | 0 | 3 | 4 | 0 |
| Dominio dell'Inganno | `chierico-dominio-dell-inganno` | `chierico` | 5 | 0 | 0 | 1 | 3 | 1 | 2 | 3 | 0 |
| Dominio dell'Ordine | `chierico-dominio-dell-ordine` | `chierico` | 6 | 0 | 0 | 2 | 4 | 0 | 2 | 4 | 0 |
| Dominio della Conoscenza | `chierico-dominio-della-conoscenza` | `chierico` | 5 | 0 | 0 | 2 | 2 | 1 | 2 | 3 | 0 |
| Dominio della Forgia | `chierico-dominio-della-forgia` | `chierico` | 6 | 0 | 0 | 2 | 4 | 0 | 2 | 4 | 0 |
| Dominio della Guerra | `chierico-dominio-della-guerra` | `chierico` | 6 | 0 | 0 | 2 | 4 | 0 | 3 | 3 | 0 |
| Dominio della Luce | `chierico-dominio-della-luce` | `chierico` | 6 | 0 | 0 | 1 | 5 | 0 | 2 | 4 | 0 |
| Dominio della Natura | `chierico-dominio-della-natura` | `chierico` | 6 | 0 | 0 | 1 | 5 | 0 | 4 | 2 | 0 |
| Dominio della Pace | `chierico-dominio-della-pace` | `chierico` | 6 | 0 | 0 | 2 | 4 | 0 | 2 | 4 | 0 |
| Dominio della Tempesta | `chierico-dominio-della-tempesta` | `chierico` | 6 | 0 | 0 | 0 | 5 | 1 | 4 | 2 | 0 |
| Dominio della Tomba | `chierico-dominio-della-tomba` | `chierico` | 6 | 0 | 0 | 1 | 5 | 0 | 3 | 3 | 0 |
| Dominio della Vita | `chierico-dominio-della-vita` | `chierico` | 6 | 0 | 0 | 1 | 5 | 0 | 5 | 1 | 0 |
| Circolo dei Sogni | `druido-circolo-dei-sogni` | `druido` | 4 | 0 | 0 | 3 | 1 | 0 | 0 | 4 | 0 |
| Circolo del Pastore | `druido-circolo-del-pastore` | `druido` | 8 | 0 | 0 | 2 | 6 | 0 | 3 | 5 | 0 |
| Circolo della Fiamma | `druido-circolo-della-fiamma` | `druido` | 4 | 0 | 0 | 3 | 1 | 0 | 1 | 3 | 0 |
| Circolo della Luna | `druido-circolo-della-luna` | `druido` | 5 | 0 | 0 | 0 | 4 | 1 | 3 | 2 | 0 |
| Circolo della Terra | `druido-circolo-della-terra` | `druido` | 14 | 0 | 0 | 0 | 13 | 1 | 13 | 1 | 0 |
| Circolo delle Spore | `druido-circolo-delle-spore` | `druido` | 5 | 0 | 0 | 1 | 4 | 0 | 1 | 4 | 0 |
| Circolo delle Stelle | `druido-circolo-delle-stelle` | `druido` | 8 | 0 | 0 | 2 | 6 | 0 | 0 | 8 | 0 |
| Arciere Arcano | `guerriero-arciere-arcano` | `guerriero` | 13 | 0 | 0 | 1 | 12 | 0 | 2 | 11 | 0 |
| Campione | `guerriero-campione` | `guerriero` | 5 | 0 | 0 | 0 | 5 | 0 | 5 | 0 | 0 |

*(Tutte le 100 sottoclassi sono dettagliate in `data/class-features/class-feature-automation-audit.json`)*

---

## 5. Complete Resource Matrix (Tutti i 104 Pool di Risorse)

| Pool ID | Nome Risorsa | Classe | Modello Capacità | Regola Massimo | Regola Reset | Lettura Runtime | Scrittura Runtime | Percorso Consumo | Percorso Reset | Esposizione UI | Test Coverage | Classificazione |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `paladino-giuramento-di-vendetta-angelo-vendicatore-usi` | Angelo Vendicatore - utilizzi | `paladino` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `warlock-arcanum-mistico-usi` | Arcanum Mistico | `warlock` | one_per_arcanum_level | default | riposo_lungo:massimo | Sì | Sì | initiativeCardModal (manual) | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `UNREVIEWED` |
| `guerriero-azione-impetuosa-usi` | Azione Impetuosa | `guerriero` | class_progression | class_level_table | riposo_breve:massimo, riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `paladino-giuramento-delle-sentinelle-baluardo-dei-mortali-usi` | Baluardo dei Mortali - utilizzi | `paladino` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `chierico-dominio-della-forgia-benedizione-della-forgia-usi` | Benedizione della Forgia - utilizzi | `chierico` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `paladino-giuramento-degli-antichi-campione-degli-antichi-usi` | Campione degli Antichi - utilizzi | `paladino` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `ladro-colpo-di-fortuna-usi` | Colpo di Fortuna - utilizzi | `ladro` | fixed | class_level_table | riposo_breve:massimo, riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `mago-ordine-degli-scribi-comunione-con-il-testo-usi` | Comunione con il Testo - utilizzi | `mago` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `bardo-collegio-dei-sussurri-conoscenze-dell-ombra-usi` | Conoscenze dell'Ombra - utilizzi | `bardo` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `paladino-giuramento-di-conquista-conquistatore-invincibile-usi` | Conquistatore Invincibile - utilizzi | `paladino` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `barbaro-cammino-del-guardiano-ancestrale-consultare-gli-spiriti-usi` | Consultare gli Spiriti - utilizzi | `barbaro` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `druido-circolo-dei-sogni-balsamo-della-corte-dell-estate-usi` | Dadi Balsamo della Corte dell’Estatе | `druido` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `guerriero-guerriero-psionico-potere-psionico-usi` | Dadi di Energia Psionica | `guerriero` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `ladro-lama-spirituale-potere-psionico-usi` | Dadi di Energia Psionica | `ladro` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `mago-portento-dadi` | Dadi di Portento | `mago` | fixed | class_level_table | riposo_lungo:rigenera | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `guerriero-dadi-superiorita` | Dadi di Superiorità | `guerriero` | fixed | class_level_table | riposo_breve:massimo, riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `warlock-il-celestiale-luce-guaritrice-usi` | Dadi Luce Guaritrice | `warlock` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `bardo-collegio-dell-incanto-esibizione-estasiante-usi` | Esibizione Estasiante - utilizzi | `bardo` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `druido-circolo-del-pastore-evocazioni-fedeli-usi` | Evocazioni Fedeli - utilizzi | `druido` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `mago-scuola-di-ammaliamento-fascino-istintivo-usi` | Fascino Istintivo - utilizzi | `mago` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `druido-forma-selvatica-usi` | Forma Selvatica | `druido` | fixed | class_level_table | riposo_breve:massimo, riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `stregone-magia-delle-ombre-forza-della-tomba-usi` | Forza della Tomba - utilizzi | `stregone` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `guerriero-samurai-forza-di-fronte-alla-morte-usi` | Forza di Fronte alla Morte - utilizzi | `guerriero` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `warlock-il-signore-fatato-fuga-velata-usi` | Fuga Velata - utilizzi | `warlock` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `chierico-incanalare-divinita-usi` | Incanalare Divinità | `chierico` | class_progression | class_level_table | riposo_breve:massimo, riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `paladino-incanalare-divinita-usi` | Incanalare Divinità | `paladino` | fixed | class_level_table | riposo_breve:massimo, riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `ranger-viandante-dell-orizzonte-individuazione-dei-portali-usi` | Individuazione dei Portali - utilizzi | `ranger` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `guerriero-indomito-usi` | Indomito | `guerriero` | class_progression | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `warlock-il-grande-antico-interdizione-entropica-usi` | Interdizione Entropica - utilizzi | `warlock` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `barbaro-ira-usi` | Ire | `barbaro` | class_progression | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `bardo-ispirazione-bardica-usi` | Ispirazione Bardica | `bardo` | formula | default | manuale | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `ladro-mistificatore-arcano-ladro-di-incantesimi-usi` | Ladro di Incantesimi - utilizzi | `ladro` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `paladino-giuramento-di-gloria-leggenda-vivente-usi` | Leggenda Vivente - utilizzi | `paladino` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `mago-ordine-degli-scribi-libro-degli-incantesimi-risvegliato-usi` | Libro degli Incantesimi Risvegliato - utilizzi | `mago` | fixed | class_level_table | riposo_breve:massimo, riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `guerriero-guerriero-psionico-maestro-della-telecinesi-usi` | Maestro della Telecinesi - utilizzi | `guerriero` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `ladro-spadaccino-maestro-duellante-usi` | Maestro Duellante - utilizzi | `ladro` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `warlock-la-lama-del-sortilegio-maledizione-della-lama-del-sortilegio-usi` | Maledizione della Lama del Sortilegio - utilizzi | `warlock` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `warlock-suppliche-occulte-mantello-di-mosche-usi` | Mantello di Mosche - utilizzi | `warlock` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `bardo-collegio-dell-incanto-manto-di-maesta-usi` | Manto di Maestà - utilizzi | `bardo` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `ranger-uccisore-di-mostri-nemesi-degli-incantatori-usi` | Nemesi degli Incantatori - utilizzi | `ranger` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `paladino-giuramento-di-devozione-nube-sacra-usi` | Nube Sacra - utilizzi | `paladino` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `stregone-magia-selvaggia-onde-di-caos-usi` | Onde di Caos - utilizzi | `stregone` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `bardo-collegio-dei-sussurri-parole-di-terrore-usi` | Parole di Terrore - utilizzi | `bardo` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `ranger-viandante-dell-orizzonte-passo-etereo-usi` | Passo Etereo - utilizzi | `ranger` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `paladino-percezione-divino-usi` | Percezione del Divino | `paladino` | formula | default | riposo_lungo:massimo | Sì | Sì | initiativeCardModal (manual) | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `UNREVIEWED` |
| `stregone-anima-divina-prescelto-dagli-dei-usi` | Prescelto dagli Dèi - utilizzi | `stregone` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `warlock-il-signore-fatato-presenza-fatata-usi` | Presenza Fatata - utilizzi | `warlock` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `barbaro-cammino-dello-zelota-presenza-zelante-usi` | Presenza Zelante - utilizzi | `barbaro` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `mago-interdizione-arcana-pf` | Punti Ferita Interdizione Arcana | `mago` | formula | default | manuale | Sì | Sì | initiativeCardModal (manual) | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `UNREVIEWED` |
| `monaco-punti-ki` | Punti Ki | `monaco` | class_progression | class_level_table | riposo_breve:massimo, riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `stregone-punti-stregoneria` | Punti Stregoneria | `stregone` | class_progression | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `guerriero-recuperare-energie-usi` | Recuperare Energie | `guerriero` | fixed | class_level_table | riposo_breve:massimo, riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `mago-recupero-arcano-usi` | Recupero Arcano | `mago` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `druido-circolo-della-fiamma-recupero-ardente-usi` | Recupero Ardente - utilizzi | `druido` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `druido-recupero-naturale-usi` | Recupero Naturale | `druido` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | initiativeCardModal (manual) | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `UNREVIEWED` |
| `stregone-anima-divina-recupero-ultraterreno-usi` | Recupero Ultraterreno - utilizzi | `stregone` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `ranger-viandante-fatato-rinforzi-fatati-usi` | Rinforzi Fatati - utilizzi | `ranger` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `paladino-imposizione-mani-punti` | Riserva Imposizione delle Mani | `paladino` | class_progression | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `guerriero-cavaliere-runico-intagliatore-di-rune-runa-delle-tempeste-usi` | Runa delle Tempeste - utilizzi | `guerriero` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `paladino-giuramento-degli-antichi-sentinella-imperitura-usi` | Sentinella Imperitura - utilizzi | `paladino` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | initiativeCardModal (manual) | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `UNREVIEWED` |
| `warlock-suppliche-occulte-sguardo-fantasma-usi` | Sguardo Fantasma - utilizzi | `warlock` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `mago-scuola-di-ammaliamento-sguardo-ipnotico-usi` | Sguardo Ipnotico - utilizzi | `mago` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `mago-scuola-di-illusione-sosia-illusorio-usi` | Sosia Illusorio - utilizzi | `mago` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `warlock-la-lama-del-sortilegio-spettro-maledetto-usi` | Spettro Maledetto - utilizzi | `warlock` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `ladro-lama-spirituale-squarciare-la-mente-usi` | Squarciare la Mente - utilizzi | `ladro` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `ladro-lama-spirituale-potere-psionico-sussurri-psichici-usi` | Sussurri Psichici - utilizzi | `ladro` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `mago-scuola-di-divinazione-terzo-occhio-usi` | Terzo Occhio - utilizzi | `mago` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `paladino-tocco-purificatore-usi` | Tocco Purificatore | `paladino` | formula | default | riposo_lungo:massimo | Sì | Sì | initiativeCardModal (manual) | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `UNREVIEWED` |
| `warlock-suppliche-occulte-tomba-di-levistus-usi` | Tomba di Levistus - utilizzi | `warlock` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `mago-scuola-di-evocazione-trasposizione-benevola-usi` | Trasposizione Benevola - utilizzi | `mago` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `bardo-collegio-della-creazione-compimento-della-creazione-usi` | Usi Compimento della Creazione | `bardo` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `chierico-dominio-del-crepuscolo-occhi-della-notte-usi` | Usi Condivisione Occhi della Notte | `chierico` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | initiativeCardModal (manual) | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `UNREVIEWED` |
| `barbaro-cammino-della-magia-selvaggia-consapevolezza-magica-usi` | Usi Consapevolezza Magica | `barbaro` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `bardo-collegio-della-creazione-creazione-animata-usi` | Usi Creazione Animata | `bardo` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `paladino-giuramento-di-gloria-difesa-gloriosa-usi` | Usi Difesa Gloriosa | `paladino` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `warlock-il-genio-dono-elementale-usi` | Usi Dono Elementale | `warlock` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `druido-circolo-della-fiamma-fiamme-cauterizzanti-usi` | Usi Fiamme Cauterizzanti | `druido` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `barbaro-cammino-della-bestia-furia-contagiosa-usi` | Usi Furia Contagiosa | `barbaro` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `warlock-l-insondabile-immersione-insondabile-usi` | Usi Immersione Insondabile | `warlock` | fixed | class_level_table | riposo_breve:massimo, riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `chierico-dominio-dell-ordine-incarnazione-della-legge-usi` | Usi Incarnazione della Legge | `chierico` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `bardo-collegio-dell-eloquenza-ispirazione-contagiosa-usi` | Usi Ispirazione Contagiosa | `bardo` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `ladro-fantasma-lamenti-dalla-tomba-usi` | Usi Lamenti dalla Tomba | `ladro` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `chierico-dominio-della-pace-legame-incoraggiante-usi` | Usi Legame Incoraggiante | `chierico` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `bardo-collegio-dell-eloquenza-linguaggio-universale-usi` | Usi Linguaggio Universale | `bardo` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `barbaro-cammino-della-magia-selvaggia-magia-corroborante-usi` | Usi Magia Corroborante | `barbaro` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `monaco-via-della-misericordia-mano-della-misericordia-suprema-usi` | Usi Mano della Misericordia Suprema | `monaco` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `mago-ordine-degli-scribi-mente-manifesta-usi` | Usi Mente Manifesta | `mago` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `chierico-dominio-del-crepuscolo-passi-nella-notte-usi` | Usi Passi nella Notte | `chierico` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `guerriero-cavaliere-runico-potenza-del-gigante-usi` | Usi Potenza del Gigante | `guerriero` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `warlock-l-insondabile-presa-dei-tentacoli-usi` | Usi Presa dei Tentacoli | `warlock` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `druido-circolo-delle-stelle-profezia-cosmica-usi` | Usi Profezia Cosmica | `druido` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `warlock-il-genio-recipiente-del-genio-usi` | Usi Rifugio Portatile | `warlock` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `stregone-anima-meccanica-ripristino-dell-equilibrio-usi` | Usi Ripristino dell’Equilibrio | `stregone` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `guerriero-cavaliere-runico-scudo-runico-usi` | Usi Scudo Runico | `guerriero` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `druido-circolo-dei-sogni-sentieri-nascosti-usi` | Usi Sentieri Nascosti | `druido` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `guerriero-samurai-spirito-combattivo-usi` | Usi Spirito Combattivo | `guerriero` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `warlock-l-insondabile-tentacoli-delle-profondita-usi` | Usi Tentacoli delle Profondità | `warlock` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `guerriero-arciere-arcano-tiro-arcano-usi` | Usi Tiro Arcano | `guerriero` | fixed | class_level_table | riposo_breve:massimo, riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `druido-circolo-del-pastore-totem-spirituale-usi` | Usi Totem Spirituale | `druido` | fixed | class_level_table | riposo_breve:massimo, riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `ranger-viandante-fatato-viandante-velato-usi` | Usi Viandante Velato | `ranger` | formula | default | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `ladro-lama-spirituale-velo-psichico-usi` | Velo Psichico - utilizzi | `ladro` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `warlock-il-celestiale-vendetta-incandescente-usi` | Vendetta Incandescente - utilizzi | `warlock` | fixed | class_level_table | riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `druido-circolo-dei-sogni-viandante-dei-sogni-usi` | Viandante dei Sogni - utilizzi | `druido` | fixed | class_level_table | riposo_breve:massimo, riposo_lungo:massimo | Sì | Sì | activateClassFeature (resourceCosts) / initiativeCardModal | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `CONNECTED` |
| `chierico-dominio-della-conoscenza-visioni-del-passato-usi` | Visioni del Passato - utilizzi | `chierico` | fixed | class_level_table | riposo_breve:massimo | Sì | Sì | initiativeCardModal (manual) | resetClassFeatureResources / initiativeCardModal | initiativeCardClassic / initiativeCardModal | INDIRECT | `UNREVIEWED` |

---

## 6. Complete Custom Code Matrix (Tutte le 15 Feature Custom)

| Classe | Sottoclasse | Feature | Adapter | File | Rationale Codice Custom | Primitive Condivise | Cleanup Auto | Test Coverage |
|---|---|---|---|---|---|---|---|---|
| Barbaro | - | Ira (`barbaro-ira`) | `condition` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | Sì | test/barbarianCombatAudit.test.js, test/barbarianFeatureRuntime.test.js, test/classFeatureAudit.test.js, test/classFeatureAuraCore.test.js, test/classFeatureCatalog.test.js, test/classFeatureCore.test.js, test/classFeatureReminderCore.test.js |
| Barbaro | Cammino del Berserker | Frenesia (`barbaro-cammino-del-berserker-frenesia`) | `condition` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | Sì | test/barbarianCombatAudit.test.js, test/barbarianFeatureRuntime.test.js, test/classFeatureCatalog.test.js |
| Bardo | - | Ispirazione Bardica (`bardo-ispirazione-bardica`) | `bardic-inspiration` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | Sì | test/bardEloquenceFeatureRuntime.test.js, test/bardLoreFeatureRuntime.test.js, test/classFeatureAudit.test.js, test/classFeatureCore.test.js |
| Chierico | - | Incanalare Divinità: Scacciare Non Morti (`chierico-incanalare-divinita-scacciare-non-morti`) | `turn-undead` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | Sì | test/clericTwilightFeatureRuntime.test.js |
| Ladro | Mistificatore Arcano | Ladro di Incantesimi (`ladro-mistificatore-arcano-ladro-di-incantesimi`) | `spell-thief` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | Sì | test/rogueArcaneTricksterFeatureRuntime.test.js |
| Paladino | - | Imposizione delle Mani (`paladino-imposizione-delle-mani`) | `lay-on-hands` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | No | test/classFeatureCatalog.test.js, test/classFeatureCore.test.js |
| Paladino | Giuramento di Devozione | Incanalare Divinità: Scacciare i Sacrileghi (`paladino-giuramento-di-devozione-incanalare-divinita-scacciare-i-sacrileghi`) | `turn-creatures` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | Sì | test/paladinDevotionFeatureRuntime.test.js |
| Paladino | - | Tocco Purificatore (`paladino-tocco-purificatore`) | `purifying-touch` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | No | Nessun direct test (TEST_GAP) |
| Stregone | Magia Selvaggia | Impulso di Magia Selvaggia (`stregone-magia-selvaggia-impulso-di-magia-selvaggia`) | `wild-magic-surge` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | No | test/sorcererWildMagicFeatureRuntime.test.js |
| Stregone | Magia Selvaggia | Onde di Caos (`stregone-magia-selvaggia-onde-di-caos`) | `wild-magic-tides` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | No | test/sorcererWildMagicFeatureRuntime.test.js |
| Stregone | - | Fonte di Magia (`stregone-fonte-di-magia`) | `sorcery-source` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | No | test/sorcererWildMagicFeatureRuntime.test.js |
| Stregone | - | Ripristino Stregonesco (`stregone-ripristino-stregonesco`) | `sorcerous-restoration` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | No | test/sorcererWildMagicFeatureRuntime.test.js |
| Bardo | Collegio dell'Eloquenza | Parole Inquietanti (`bardo-collegio-dell-eloquenza-parole-inquietanti`) | `unsettling-words` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | Sì | test/bardEloquenceFeatureRuntime.test.js |
| Bardo | Collegio dell'Eloquenza | Linguaggio Universale (`bardo-collegio-dell-eloquenza-linguaggio-universale`) | `universal-speech` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | Sì | test/bardEloquenceFeatureRuntime.test.js |
| Bardo | Collegio dell'Eloquenza | Ispirazione Contagiosa (`bardo-collegio-dell-eloquenza-ispirazione-contagiosa`) | `bardic-inspiration` | `src/classFeatureRuntime.js` | Gestione custom dedicata per flussi o parametri specifici | `withItemMetaHistory`, `runEffectsMutation` | Sì | test/bardEloquenceFeatureRuntime.test.js |

---

## 7. Complete Aura / Persistent State Matrix (Tutte le 68 Feature con Lifecycle)

| Classe | Feature | Categoria Lifecycle | Adapter | Targeting | Durata | Cleanup Auto | Test Coverage |
|---|---|---|---|---|---|---|---|
| Barbaro | Ira (`barbaro-ira`) | `ROUND_STATE` | `condition` | `SELF` | `ROUND_BASED` | Sì | Coperto |
| Barbaro | Attacco Irruento (`barbaro-attacco-irruento`) | `TURN_BOUND_STATE` | `condition` | `SELF` | `UNTIL_TURN` | Sì | Coperto |
| Barbaro | Aquila (`barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila`) | `TOGGLE_STATE` | `condition` | `SELF` | `TOGGLE` | Sì | Coperto |
| Barbaro | Frenesia (`barbaro-cammino-del-berserker-frenesia`) | `TOGGLE_STATE` | `condition` | `SELF` | `TOGGLE` | Sì | Coperto |
| Barbaro | Lupo (`barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo`) | `SPATIAL_AURA` | `aura` | `AURA` | `PERSISTENT` | Sì | Coperto |
| Barbaro | Orso (`barbaro-cammino-del-combattente-totemico-spirito-totemico-orso`) | `TOGGLE_STATE` | `condition` | `SELF` | `TOGGLE` | Sì | Coperto |
| Barbaro | Presenza Intimidatoria (`barbaro-cammino-del-berserker-presenza-intimidatoria`) | `TURN_BOUND_STATE` | `condition` | `SINGLE_TARGET` | `UNTIL_TURN` | Sì | Coperto |
| Barbaro | Aquila (`barbaro-cammino-del-combattente-totemico-sintonia-totemica-aquila`) | `TOGGLE_STATE` | `condition` | `SELF` | `TOGGLE` | Sì | Coperto |
| Barbaro | Orso (`barbaro-cammino-del-combattente-totemico-sintonia-totemica-orso`) | `SPATIAL_AURA` | `aura` | `AURA` | `PERSISTENT` | Sì | Coperto |
| Bardo | Ispirazione Bardica (`bardo-ispirazione-bardica`) | `ROUND_STATE` | `bardic-inspiration` | `SINGLE_TARGET` | `ROUND_BASED` | Sì | Coperto |
| Bardo | Controfascino (`bardo-controfascino`) | `SPATIAL_AURA` | `aura` | `AURA` | `PERSISTENT` | Sì | Coperto |
| Chierico | Benedizione dell'Ingannatore (`chierico-dominio-dell-inganno-benedizione-dell-ingannatore`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Chierico | Incanalare Divinità: Charme su Animali e Vegetali (`chierico-dominio-della-natura-incanalare-divinita-charme-su-animali-e-vegetali`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Chierico | Incanalare Divinità: Conoscenze Secolari (`chierico-dominio-della-conoscenza-incanalare-divinita-conoscenze-secolari`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Chierico | Incanalare Divinità: Invocare Duplicato (`chierico-dominio-dell-inganno-incanalare-divinita-invocare-duplicato`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Chierico | Incanalare Divinità: Scacciare Non Morti (`chierico-incanalare-divinita-scacciare-non-morti`) | `ROUND_STATE` | `turn-undead` | `SINGLE_TARGET` | `ROUND_BASED` | Sì | Coperto |
| Chierico | Incanalare Divinità: Lettura del Pensiero (`chierico-dominio-della-conoscenza-incanalare-divinita-lettura-del-pensiero`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Chierico | Corona di Luce (`chierico-dominio-della-luce-corona-di-luce`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Druido | Forma Selvatica (`druido-forma-selvatica`) | `PERSISTENT_EFFECT` | `none` | `SELF` | `PERSISTENT` | Sì | Non coperto |
| Guerriero | Arma Vincolata (`guerriero-cavaliere-mistico-arma-vincolata`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Ladro | Imboscata Magica (`ladro-mistificatore-arcano-imboscata-magica`) | `TURN_BOUND_STATE` | `condition` | `SINGLE_TARGET` | `UNTIL_TURN` | Sì | Coperto |
| Ladro | Ingannatore Versatile (`ladro-mistificatore-arcano-ingannatore-versatile`) | `TURN_BOUND_STATE` | `condition` | `SINGLE_TARGET` | `UNTIL_TURN` | Sì | Coperto |
| Ladro | Ladro di Incantesimi (`ladro-mistificatore-arcano-ladro-di-incantesimi`) | `ROUND_STATE` | `spell-thief` | `SINGLE_TARGET` | `ROUND_BASED` | Sì | Coperto |
| Mago | Evocazione Minore (`mago-scuola-di-evocazione-evocazione-minore`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Mago | Sguardo Ipnotico (`mago-scuola-di-ammaliamento-sguardo-ipnotico`) | `TURN_BOUND_STATE` | `none` | `SELF` | `UNTIL_TURN` | Sì | Non coperto |
| Mago | Illusioni Duttili (`mago-scuola-di-illusione-illusioni-duttili`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Mago | Maestro Trasmutatore (`mago-scuola-di-trasmutazione-maestro-trasmutatore`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Mago | Realtà Illusoria (`mago-scuola-di-illusione-realta-illusoria`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Paladino | Percezione del Divino (`paladino-percezione-del-divino`) | `TURN_BOUND_STATE` | `condition` | `SELF` | `UNTIL_TURN` | Sì | Non coperto |
| Paladino | Incanalare Divinità: Abiurare Nemico (`paladino-giuramento-di-vendetta-incanalare-divinita-abiurare-nemico`) | `ROUND_STATE` | `condition-choice` | `SINGLE_TARGET` | `ROUND_BASED` | Sì | Non coperto |
| Paladino | Incanalare Divinità: Arma Consacrata (`paladino-giuramento-di-devozione-incanalare-divinita-arma-consacrata`) | `ROUND_STATE` | `condition` | `SELF` | `ROUND_BASED` | Sì | Coperto |
| Paladino | Incanalare Divinità: Giuramento di Inimicizia (`paladino-giuramento-di-vendetta-incanalare-divinita-giuramento-di-inimicizia`) | `ROUND_STATE` | `condition` | `SINGLE_TARGET` | `ROUND_BASED` | Sì | Coperto |
| Paladino | Incanalare Divinità: Scacciare gli Infedeli (`paladino-giuramento-degli-antichi-incanalare-divinita-scacciare-gli-infedeli`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Paladino | Incanalare Divinità: Scacciare i Sacrileghi (`paladino-giuramento-di-devozione-incanalare-divinita-scacciare-i-sacrileghi`) | `ROUND_STATE` | `turn-creatures` | `SINGLE_TARGET` | `ROUND_BASED` | Sì | Coperto |
| Paladino | Aura di Protezione (`paladino-aura-di-protezione`) | `SPATIAL_AURA` | `aura` | `AURA` | `PERSISTENT` | Sì | Coperto |
| Paladino | Aura di Devozione (`paladino-giuramento-di-devozione-aura-di-devozione`) | `SPATIAL_AURA` | `aura` | `AURA` | `PERSISTENT` | Sì | Coperto |
| Paladino | Aura di Coraggio (`paladino-aura-di-coraggio`) | `SPATIAL_AURA` | `aura` | `AURA` | `PERSISTENT` | Sì | Coperto |
| Paladino | Angelo Vendicatore (`paladino-giuramento-di-vendetta-angelo-vendicatore`) | `SPATIAL_AURA` | `aura` | `AURA` | `PERSISTENT` | Sì | Coperto |
| Paladino | Campione degli Antichi (`paladino-giuramento-degli-antichi-campione-degli-antichi`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Paladino | Nube Sacra (`paladino-giuramento-di-devozione-nube-sacra`) | `SPATIAL_AURA` | `aura` | `AURA` | `PERSISTENT` | Sì | Coperto |
| Ranger | Compagno del Ranger (`ranger-signore-delle-bestie-compagno-del-ranger`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Warlock | Difese Seducenti (`warlock-il-signore-fatato-difese-seducenti`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Warlock | Delirio Oscuro (`warlock-il-signore-fatato-delirio-oscuro`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Ranger (Revised) | Consapevolezza Primordiale (`ranger-revised-consapevolezza-primordiale`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Coperto |
| Ranger (Revised) | Difesa dal Multiattacco (`ranger-revised-conclave-del-cacciatore-tattiche-difensive-difesa-dal-multiattacco`) | `TURN_BOUND_STATE` | `none` | `SELF` | `UNTIL_TURN` | Sì | Non coperto |
| Ranger (Revised) | Nascondersi in Piena Vista (`ranger-revised-nascondersi-in-piena-vista`) | `PERSISTENT_EFFECT` | `none` | `SELF` | `PERSISTENT` | Sì | Coperto |
| Barbaro | Forma della Bestia (`barbaro-cammino-della-bestia-forma-della-bestia`) | `TOGGLE_STATE` | `condition` | `SELF` | `TOGGLE` | Sì | Coperto |
| Barbaro | Impeto Selvaggio (`barbaro-cammino-della-magia-selvaggia-impeto-selvaggio`) | `TOGGLE_STATE` | `condition` | `SELF` | `TOGGLE` | Sì | Coperto |
| Barbaro | Risultato 2 (`barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-2`) | `TOGGLE_STATE` | `condition` | `SELF` | `TOGGLE` | Sì | Coperto |
| Barbaro | Risultato 5 (`barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-5`) | `TOGGLE_STATE` | `condition` | `SELF` | `TOGGLE` | Sì | Coperto |
| Barbaro | Magia Corroborante (`barbaro-cammino-della-magia-selvaggia-magia-corroborante`) | `ROUND_STATE` | `condition` | `SINGLE_TARGET` | `ROUND_BASED` | Sì | Coperto |
| Barbaro | Chiamata alla Caccia (`barbaro-cammino-della-bestia-chiamata-alla-caccia`) | `TOGGLE_STATE` | `condition` | `SINGLE_TARGET` | `TOGGLE` | Sì | Coperto |
| Bardo | Parole Inquietanti (`bardo-collegio-dell-eloquenza-parole-inquietanti`) | `TURN_BOUND_STATE` | `unsettling-words` | `SINGLE_TARGET` | `UNTIL_TURN` | Sì | Coperto |
| Bardo | Linguaggio Universale (`bardo-collegio-dell-eloquenza-linguaggio-universale`) | `ROUND_STATE` | `universal-speech` | `SINGLE_TARGET` | `ROUND_BASED` | Sì | Coperto |
| Bardo | Ispirazione Contagiosa (`bardo-collegio-dell-eloquenza-ispirazione-contagiosa`) | `ROUND_STATE` | `bardic-inspiration` | `SINGLE_TARGET` | `ROUND_BASED` | Sì | Coperto |
| Chierico | Legame Incoraggiante (`chierico-dominio-della-pace-legame-incoraggiante`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Chierico | Incanalare Divinità: Santuario del Crepuscolo (`chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo`) | `SPATIAL_AURA` | `aura` | `AURA` | `PERSISTENT` | Sì | Coperto |
| Chierico | Passi nella Notte (`chierico-dominio-del-crepuscolo-passi-nella-notte`) | `ROUND_STATE` | `condition` | `SELF` | `ROUND_BASED` | Sì | Coperto |
| Druido | Forma Siderale (`druido-circolo-delle-stelle-forma-siderale`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Guerriero | Potenza del Gigante (`guerriero-cavaliere-runico-potenza-del-gigante`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Mago | Melodia della Lama (`mago-canto-della-lama-melodia-della-lama`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Monaco | Braccia del Sé Astrale (`monaco-via-del-se-astrale-braccia-del-se-astrale`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Warlock | Tentacoli delle Profondità (`warlock-l-insondabile-tentacoli-delle-profondita`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |
| Barbaro | Aura Tempestosa (`barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa`) | `SPATIAL_AURA` | `aura` | `AURA` | `PERSISTENT` | Sì | Coperto |
| Barbaro | Protettori Ancestrali (`barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali`) | `TURN_BOUND_STATE` | `condition` | `SINGLE_TARGET` | `UNTIL_TURN` | Sì | Coperto |
| Barbaro | Presenza Zelante (`barbaro-cammino-dello-zelota-presenza-zelante`) | `TURN_BOUND_STATE` | `condition` | `SINGLE_TARGET` | `UNTIL_TURN` | Sì | Coperto |
| Barbaro | Tempesta Protettrice (`barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice`) | `SPATIAL_AURA` | `aura` | `SINGLE_TARGET` | `PERSISTENT` | Sì | Non coperto |
| Warlock | Maledizione della Lama del Sortilegio (`warlock-la-lama-del-sortilegio-maledizione-della-lama-del-sortilegio`) | `ROUND_STATE` | `none` | `SELF` | `ROUND_BASED` | Sì | Non coperto |

### Focus: Spirito del Lupo (`barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo`)
- **Stato**: IMPLEMENTATO (`adapter: "aura"`, `targetingMode: "AURA"`, `persistentCategory: "TOGGLE_STATE"`).
- **Comportamento**: Proietta il vantaggio agli attacchi in mischia degli alleati entro 1.5m finché l'Ira del Barbaro è attiva (`untilFeatureId: "barbaro-ira"`).
- **Integrità**: Nessuna alterazione subita; protetta da test in `test/barbarianFeatureRuntime.test.js` e `test/classFeatureAuraCore.test.js`.

---

## 8. Source Conflict Matrix

| ID Feature | Classe | Nome Feature | Fonte A | Fonte B | Verità Runtime | Decisione Target Intesa | Raccomandazione Riconciliazione |
|---|---|---|---|---|---|---|---|
| `chierico-dominio-della-vita-incanalare-divinita-preservare-vita` | Chierico | Incanalare Divinità: Preservare Vita | DB PHB2014 & feature-matrix.sample.json §322: 'assisted multi-target HP allocation' | Runtime catalog: status='not-automated', reason='adapter-not-implemented' | Capacità esposta nella card e associata al pool, ma priva di adapter per erogare cura sui target | targetAutomationLevel: PARTIAL (richiede adapter per ripartizione punti su selezione bersagli) | Pianificare in CF-B03 con primitive RES.ALLOCATION / HP.ASSISTED_CANONICAL |
| `guerriero-recuperare-energie` | Guerriero | Recuperare Energie | DB PHB2014 & feature-matrix.sample.json §718: 'assisted review + explicit healing input + canonical HP mutation' | Runtime catalog: status='not-automated', reason='adapter-not-implemented' | Pool 1d10+livello registrato e visibile, ma nessuna erogazione diretta di cura Quick HP | targetAutomationLevel: PARTIAL (richiede Quick HP adapter con modal review/valore) | Pianificare in CF-B02 con primitive UI.VALUE_INPUT / HP.ASSISTED_CANONICAL |
| `ladro-assassino-assassinare` | Ladro | Assassinare | DB PHB2014: activation='passiva', completeness='riferimento' | Runtime catalog: non esposta (manca override include:true), feature-matrix §762: 'descriptive surprise reminder' | Non presente nel catalogo runtime 551 né nella UI | targetAutomationLevel: MANUAL (reminder passivo descrittivo al tavolo, non automatizzabile) | Mantenere target MANUAL; se desiderato sulla scheda, aggiungere include:true in overrides |

---

## 9. Functional Gap Matrix (Top Gaps per Pianificazione Microbatch)

| ID Feature | Classe | Sottoclasse | Nome Feature | Categoria Gap | Severità | Target Inteso | Stato Corrente | Fix Scope Stimato |
|---|---|---|---|---|---|---|---|---|
| `chierico-dominio-della-vita-incanalare-divinita-preservare-vita` | Chierico | Vita | Preservare Vita | EXECUTION_GAP | P2 | PARTIAL | MANUAL (`not-automated`) | Introdurre adapter ripartizione cure su multi-target fino a metà PF max (MEDIUM) |
| `guerriero-recuperare-energie` | Guerriero | - | Recuperare Energie | EXECUTION_GAP | P2 | PARTIAL | TRACK_ONLY (`not-automated`) | Introdurre Quick HP adapter per autoguarigione 1d10+livello (LOW-MEDIUM) |
| `guerriero-azione-impetuosa` | Guerriero | - | Azione Impetuosa | RESOURCE_GAP | P2 | TRACK_ONLY | MANUAL (`not-automated`) | Connettere pool usi con tracking turno (LOW) |
| `monaco-raffica-di-colpi` | Monaco | - | Raffica di Colpi | RESOURCE_GAP | P2 | TRACK_ONLY | MANUAL (`not-automated`) | Connettere costo 1 Punto Ki su Azione Bonus (LOW) |
| `druido-forma-selvatica` | Druido | - | Forma Selvatica | EXECUTION_GAP | P2 | PARTIAL | TRACK_ONLY (`not-automated`) | Introdurre stato di trasformazione con note HP bestia (MEDIUM-HIGH) |

*(L'elenco completo dei 462 functional gap è disponibile per query in `data/class-features/class-feature-automation-audit.json`)*

---

## 10. Test Gap Matrix (4 Feature Implementate prive di Direct Test)

| ID Feature | Classe | Sottoclasse | Nome Feature | Categoria Gap | Severità | Evidenza | Fix Scope Stimato |
|---|---|---|---|---|---|---|---|
| `paladino-percezione-del-divino` | Paladino | - | Percezione del Divino | TEST_GAP | P3 | Feature implementata a runtime ma priva di asserzione diretta in `test/` | Aggiungere unit test di regressione diretta (LOW) |
| `paladino-giuramento-di-vendetta-incanalare-divinita-abiurare-nemico` | Paladino | Giuramento di Vendetta | Incanalare Divinità: Abiurare Nemico | TEST_GAP | P3 | Feature implementata a runtime ma priva di asserzione diretta in `test/` | Aggiungere unit test di regressione diretta (LOW) |
| `paladino-tocco-purificatore` | Paladino | - | Tocco Purificatore | TEST_GAP | P3 | Feature implementata a runtime ma priva di asserzione diretta in `test/` | Aggiungere unit test di regressione diretta (LOW) |
| `barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice` | Barbaro | Cammino dell'Araldo della Tempesta | Tempesta Protettrice | TEST_GAP | P3 | Feature implementata a runtime ma priva di asserzione diretta in `test/` | Aggiungere unit test di regressione diretta (LOW) |

---

## 11. Known Features Recheck

| Feature | Current Automation | Target Automation | Runtime Exposure | Coverage Status | Test Coverage | Source Conflict |
|---|---|---|---|---|---|---|
| **Ira / Rage** (`barbaro-ira`) | FULL | FULL | `true` (PANEL) | ACCEPTED | DIRECT | `false` |
| **Ispirazione Bardica** (`bardo-ispirazione-bardica`) | FULL | FULL | `true` (PANEL) | ACCEPTED | DIRECT | `false` |
| **Protettori Ancestrali** (`barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali`) | FULL | FULL | `true` (PANEL) | ACCEPTED | DIRECT | `false` |
| **Santuario del Crepuscolo** (`chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo`) | FULL | FULL | `true` (PANEL) | ACCEPTED | DIRECT | `false` |
| **Fonte di Magia** (`stregone-fonte-di-magia`) | FULL | FULL | `true` (PANEL) | ACCEPTED | DIRECT | `false` |
| **Preservare Vita** (`chierico-dominio-della-vita-incanalare-divinita-preservare-vita`) | MANUAL | PARTIAL | `true` (PANEL) | GAP | INDIRECT | `true` |
| **Recuperare Energie** (`guerriero-recuperare-energie`) | TRACK_ONLY | PARTIAL | `true` (PANEL) | GAP | INDIRECT | `true` |
| **Assassinare** (`ladro-assassino-assassinare`) | MANUAL | MANUAL | `false` (HIDDEN) | ACCEPTED | NONE | `true` |
| **Spirito del Lupo** (`barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo`) | FULL | FULL | `true` (PANEL) | ACCEPTED | DIRECT | `false` |

---

## 12. Revised Microbatch Plan (Advisory)

I microbatch futuri sono allineati ai target curati e alle discrepanze rilevate:

### CF-B01 — Chiusura Test Gap su Feature Implementate (`P3`)
- **Classi**: Barbaro, Paladino
- **Feature**:
  - `barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice`
  - `paladino-percezione-del-divino`
  - `paladino-giuramento-di-vendetta-incanalare-divinita-abiurare-nemico`
  - `paladino-tocco-purificatore`
- **Obiettivo**: Aggiungere unit test in `test/` per raggiungere il 100% di direct test sulle 59 feature implementate a runtime.
- **Complessità**: LOW

### CF-B02 — Guerriero: Recuperare Energie & Azione Impetuosa (`P2`)
- **Classe**: Guerriero
- **Feature**: `guerriero-recuperare-energie`, `guerriero-azione-impetuosa`, `guerriero-indomito`
- **Obiettivo**: Risolvere il source conflict di Recuperare Energie collegando l'adapter Quick HP (1d10 + livello) e tracciare l'Azione Impetuosa.
- **Complessità**: LOW-MEDIUM

### CF-B03 — Chierico: Preservare Vita & Canali Divini Base (`P2`)
- **Classe**: Chierico
- **Feature**: `chierico-dominio-della-vita-incanalare-divinita-preservare-vita`, `chierico-dominio-della-luce-incanalare-divinita-splendore-dell-alba`
- **Obiettivo**: Risolvere il source conflict di Preservare Vita con ripartizione punti di cura su selezione multi-target.
- **Complessità**: MEDIUM

### CF-B04 — Monaco: Punti Ki & Difese Base (`P2`)
- **Classe**: Monaco
- **Feature**: `monaco-difesa-senza-armatura`, `monaco-raffica-di-colpi`, `monaco-passo-del-vento`, `monaco-paziente-difesa`
- **Obiettivo**: Connettere il pool Ki alle abilità di movimento e difesa del Monaco.
- **Complessità**: MEDIUM

### CF-B05 — Druido: Forma Selvatica & Circoli Base (`P2`)
- **Classe**: Druido
- **Feature**: `druido-forma-selvatica`, `druido-circolo-della-luna-forma-selvatica-combattimento`
- **Obiettivo**: Gestione dello stato di Forma Selvatica con tracciamento usi e note HP bestia.
- **Complessità**: MEDIUM-HIGH

---

## 13. Validation

Comandi di validazione eseguiti:
```bash
npm test
npm run build
```

- **Test Suite**: **1788 passing / 0 failing**
- **Production Build**: **PASS** (nessun errore di bundling o TypeScript)

---

## 14. Diff Scope

Nessun file in `src/` è stato modificato:
- `data/class-features/class-feature-automation-audit.json` (Source of Truth canonica aggiornata ed estesa)
- `docs/CLASS_FEATURE_AUDIT.md` (Report di audit ufficiale reconciliato)

---

## 15. Out-of-Scope Findings

Nessuna anomalia riscontrata nei sottosistemi congelati (scene lifecycle, HP memory, dispatcher, Combat Log, Static Zones, Concentration, VFX).

==================================================
VERDETTO FINALE: PASS_AUDIT_COMPLETE
==================================================
