# Boss Action Profile — tranche 1

Implementato il vertical slice HTML → definizione normalizzata → binding Actor Profile → Boss Actions → primitive esistenti → History/Undo → Combat Log v3. Nessuna implementazione di Auril completa.

## Uso

Dal token reale del boss: menu contestuale **Boss Actions**, oppure pulsante **Boss** nella tracker card quando il token è Epic o ha un binding. Il launcher richiede il ruolo GM; gli slot virtuali Epic/Lair/Paragon sono esclusi.

Importare il file HTML o un export JSON, quindi **Collega al token**. Le definizioni di fase 2 e fase 3 sono distinte: Blizzard Strike appartiene alla fase 3. Cambiare binding manualmente non implementa una phase transition.

Scegliere una capacità. Icekiss e Blizzard raccolgono target, modalità/esito e importi dei componenti prima della mutation. Il GM può confermare le medie suggerite o inserire i danni tirati; il runtime non esegue formule come codice. Spellcasting apre il pannello esistente di Slow.

## Comportamenti implementati

| Capacità | Stato | Esecuzione |
| --- | --- | --- |
| Icekiss +2 | SUPPORTED | Mischia/distanza, bonus +12, hit/miss, slashing 2d10+7 (media stampata 18), cold 2d6 (media stampata 7). Miss senza danno. |
| Blizzard Strike | PARTIAL | STR DC 15, 2d8 bludgeoning + 2d8 cold, danno pieno/fallimento e metà/successo tramite policy condivisa. |
| Spellcasting | PARTIAL | Riferimento al catalogo slow; DC 19 e attack bonus +11 dal descrittore. Altri spell e limiti restano nel testo manuale. |
| Tutte le altre capacità | UNSUPPORTED | Pulsante/riferimento e testo originale leggibile; nessuna execution inventata. |

Blizzard mostra: “Il bersaglio viene spinto fino a 20 ft. in una direzione scelta da Auril.” Nessuna posizione viene modificata automaticamente. Al successo il log non dichiara un movimento da applicare.

Il sorgente stampa 18 complessivi per Blizzard. Le medie 9 dei singoli 2d8 sono etichettate come derivate, senza inventare due medie stampate. La metà si applica a ciascun componente con scaledQuickHPAmount, come nei workflow a componenti esistenti: 9 + 9 diventa 4 + 4. Non c’è una policy Boss separata.

I limiti 1/Round, 1/Phase e Special Recharge sono visibili come riferimenti; non sono contatori automatizzati in questa tranche. Il GM verifica manualmente target, distanza e altre restrizioni.

## Contratti e moduli nuovi

### Definizione

**src/bossActionProfileCore.js**

- importBossActionHTML: tokenizer/albero inerte per la grammar dei due HTML reali. Nessun DOM attivo, script, handler, caricamento URL o LLM runtime.
- validateBossActionProfile: valida esclusivamente dati strutturati; non reinterpreta HTML o prosa.
- sanitizeBossActionBinding: conserva solo profileId, profileRevision, bossDefinitionId, phaseId.
- profileVersion e parserVersion = 1.
- profileRevision e rawSource.sourceHash: SHA-256 del sorgente HTML originale; revisioni valide a 64 caratteri esadecimali.
- Definizione: identità, name, type, abilities, diagnostics, rawSource {html, sourceName, sourceHash}.
- Ability: id, name, category, automation, rawText, usage, execution opzionale, manualText.
- Execution riconosciute: attack-damage, save-damage, spell-reference.
- Danno: id, type, formula, printedAverage oppure average derivata.
- rawSource.html è integro; rawText è testo semplice leggibile con whitespace normalizzato, senza troncamento.

La grammar è ancorata all’intera descrizione: aggiungere una clausola non riconosciuta impedisce l’automazione. Le mechanics non dipendono da controlli hardcoded sul nome Auril.

**src/bossActionProfileStore.js**

createBossActionProfileStore espone put/get/list/exportProfile/importProfile. LocalStorage usa l’envelope versionato com.thebigpicture.initiative/bossActionProfiles/v1. La stessa identità/revisione è immutabile; una collisione con dati diversi è rifiutata. Export/import mantiene HTML, testo, diagnostics e normalized profile completi. Errori di storage/quota vengono esposti, senza troncamento.

La definizione completa non entra nel Room registry. Un altro browser deve importare l’export JSON della revisione referenziata; una definizione locale mancante blocca l’esecuzione.

### Binding e runtime

**src/bossActionExecutionCore.js**

buildBossActionMutation costruisce un piano usando HP canonici del token e primitive quickHpCore. Conserva componenti e risultati indipendenti nel payload History e nella causality; somma solo per la mutation HP finale.

bossInstanceForItem separa definizione e istanza. bossActionState contiene version, boundTokenId, bossDefinitionId, bossInstanceId e lastAction. Il fallback è deterministico dal token e dalla definizione. Rename conserva l’istanza; una copia del token non eredita l’istanza dell’originale. Nessun HP runtime è memorizzato nella definizione o in bossActionState.

manifestationId è una futura estensione del contratto; non ci sono shared manifestations, binding multipli o phase transition.

**src/bossActionExecution.js**

createBossActionRuntime espone presentation, bind/unbind, executeBossAction e launchBossActionSpell. Controlla ruolo, token reale, binding/revisione, istanza, scena e decisioni. Un draft conserva il comando preparato per retry con ACK perso; riutilizza il broker/coordinatore esistente, senza una nuova lane di mutation o History.

I retry con la stessa identità e decisioni diverse vengono rifiutati. Le ricevute duplicate non riproiettano HP ipotetici e non ripetono reminder. Undo è dichiarato disponibile solo con History confermata, non con historyPending/historySkipped.

Dopo il commit, riusa syncHPBarNow, syncHPTextBatchNow, syncHPBatchToMemory, refreshConditionLabels e reminder/concentration warning esistenti. Sono proiezioni dello stato canonico, non nuove mutation HP.

### Provenance

**src/monsterActionContextCore.js**

createMonsterActionContext / normalizeMonsterActionContext / applyMonsterActionContext trasportano:

- actor: id, tokenId, name, bossInstanceId;
- cause: kind monster-action, profileId, profileRevision, phaseId, bossInstanceId, actionId, actionName, actionInstanceId;
- referencedSpell per Slow, con identità del catalogo e dati della normale causality spell;
- spellcasting: DC/attack bonus parsati.

L’attore proviene dal token reale, mai dal turno corrente o dallo slot Epic. actionInstanceId correla il workflow e la voce History. Per i danni diretti coincide con commandId/correlationId; nel percorso Slow la normale identità operativa spell resta invariata e la causa conserva actionInstanceId.

### UI

**boss-actions.html**, **src/boss-actions.js**, **src/bossActionsViewCore.js**, **src/bossActionsLauncher.js**

Popover minimo: libreria/import/bind/unbind/export, gruppi Traits/Actions/Epic/Reactions, stato SUPPORTED/PARTIAL/UNSUPPORTED, restrizioni e testo raw via textContent. I form raccolgono tutte le decisioni prima del commit. Un cambio scena invalida il pannello. Quick Actions non contiene né la definizione né un nuovo array Boss.

Un pannello Slow lanciato da Spellcasting è monouso: dopo un commit, anche se annullato, una nuova azione parte dal boss con una nuova identità. Gli spell ordinari conservano “Applica di nuovo”.

## Punti di integrazione modificati

| File | Funzioni/blocchi |
| --- | --- |
| src/initiativeCards.js | sanitizeInitiativeCard, mergeProfile, known fields, hasInitiativeCardValues: riferimento compatto. saveInitiativeCard: opzione preserveExhaustion per update parziali del binding; preserva base e fallback legacy, escludendo contribution. |
| src/initiativeList.js | entryFromSceneItem: binding compatto; __mountTrackerQuickActions: pulsante launcher Boss sul token reale. Nessuna modifica ai turni, alle code o ai render guard. |
| src/contextMenu.js | Registrazione del launcher Boss Actions per il token creatura. |
| src/effectsMutations.js | applyMetadataPatchesToPlan / commitEffectsMutationPlan: gli assert esistenti sopravvivono come precondizioni fino al callback SDK. Non vengono scritti né aggiunti ai campi History/Undo. |
| src/spellUnifiedPanelRoutingCore.js | Query/request/route conserva il monster action context opzionale e rifiuta input malformed. |
| src/spellUnifiedPanelCore.js | createSpellPanelSession / primaryActionFor: conserva contesto e flag monouso opzionale; caster/spell diversi vengono rifiutati. |
| src/spell-unified-panel.js | commitArea, cambio caster/spell: contesto protetto e sessione Boss monouso; comportamento ordinario invariato. |
| src/spellUnifiedAreaAdapter.js | buildSpellUnifiedAreaCommand inoltra il contesto. |
| src/spellAreaResolutionCommandCore.js | buildSpellAreaResolutionCommand valida/trasporta il contesto opzionale. |
| src/spellAreaResolutionExecutor.js | castContextFor, buildSpellAreaResolutionExecutionPlan, spellAreaCausality, executeSpellAreaResolution: DC/reminder e cause Boss; token/binding/istanza live e assert al commit. |
| src/combatLogV3Core.js | normalizePerson conserva tokenId/bossInstanceId, con il log e lo storage v3 esistenti. |
| vite.config.js | Entry boss-actions.html. |

History: i danni diretti usano una sola runEffectsMutation con HP, conseguenze zero HP/damage-end e runtime state. Slow usa il resolver/withItemMetaHistory esistente con gli effetti coordinati; una sola voce ripristina concentrazione e condizioni. La correlation da sola non viene usata come prova di atomicità.

Nessuna modifica a schema IndexedDB, metadata key canoniche, active turn, initiative order, slot Epic o gestione generale degli HP bar attachment. Nessun secondo damage engine, History o Combat Log.

## Test aggiunti e fixture

- test/bossActionProfileCore.test.js: entrambi gli HTML, conteggi 21/15, raw/source hash, tre pattern, unsupported, markup hostile/malformed, versioni/revisioni e descriptor sicuri.
- test/bossActionProfileStore.test.js: export/import senza troncamento, reload, collisioni revisioni e errori storage.
- test/bossActionExecutionCore.test.js: modalità Icekiss, miss, componenti, rounding condiviso, manual remainder e identità duplicate/rename.
- test/bossActionExecutionIntegration.test.js: coordinator/History/Undo di produzione con SDK simulato; Icekiss/Blizzard/Slow, zero HP, persistence/binding, exhaustion/contribution/cap/legacy, retry con broker reale, History pending, race SDK e precondizioni non mutanti.
- test/bossActionsViewCore.test.js: grouping, target reali, validation e fallback.
- test/bossActionsPopover.test.js: controller UI reale con DOM simulato, import/bind/decisioni/raw/manual/Slow e cambio scena.
- test/bossActionSpellSession.test.js: sessione reale conserva context e blocca caster/spell diversi/riesecuzione.
- test/monsterActionSpellContext.test.js: query → session → command → resolver → History/log, DC/reminder, source reale e regressione ordinary Slow.
- test/fixtures/boss-actions/auril-phase-2.html e auril-phase-3.html: copie integrali dei due sorgenti reali.
- docs/superpowers/plans/2026-10-10-boss-action-profile-tranche-1.md: piano di tranche.

Verifica finale 10 ottobre 2026:

- Suite mirata degli otto file nuovi: **70/70 pass**, zero skip/failure.
- npm test: **3056/3056 pass**, zero skip/failure.
- npm run build: **PASS**. Vite segnala i bundle catalogo oltre 500 kB; nessun errore di build.
- git diff --check: **PASS**.

Test con SDK/DOM simulati; non è stata eseguita una sessione in una stanza Owlbear live.

## Esclusioni intenzionali

Restano manuali/non automatizzati: forced movement, contatori/recharge/sequencing Epic, spell diversi da Slow, tratti passivi/listener globali, Doppia Manifestazione/shared state, Rimebound Link, fase successiva automatica, Mark/Detonation, hpMax/healing speciali, Titan’s Grasp/Crush/Hurl, zone e delayed collapse di Hand Slam, Meteor Swarm/Gather/Breathe, Spectral Refraction e Divine Brilliance.

Le capacità fuori scope sono conservate in ogni definizione come raw reference; nessuna execution viene inventata. Importare il profilo non attiva effetti passivi.
