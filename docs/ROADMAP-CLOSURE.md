# Roadmap hardening e release readiness

Data della verifica: 2026-08-13  
Versione applicazione: '1.3.0'  
Baseline audit: 'be18c1e00914213b34d872a8a800ed5f77cdf954'

## Decisione

**Verdetto: GO condizionato al gate manuale browser/Owlbear prima della pubblicazione.**

La suite Node/fake-OBR, gli audit deterministici e i controlli di build sono
verdi. In questa sessione non e' stato possibile dimostrare layout, input,
paint, rete e lifecycle di un Owlbear reale; il checklist manuale in fondo a
questo documento e' quindi un gate di release, non una formalita'.

Il prodotto e' verificato per il contratto **single-GM**. Il History Owner
garantisce serializzazione per client/realm: due client GM distinti possono
avere owner distinti e il contratto attuale e' last-commit-wins. Non esiste un
owner distribuito o un lock cross-client. Se il requisito di prodotto e'
multi-GM con merge/serializzazione globale, il verdetto diventa **NO-GO** finche'
non viene introdotto e testato quel coordinamento.

## Risultato degli step 1-8

| Step | Intervento | Risultato | Finding |
| --- | --- | --- | --- |
| 1 | Autorita' di ActorVitals | Room/scene resta autorita' canonica; il token non sovrascrive HP piu' recenti; fallback hpMemory preservato. | GS-001 risolto |
| 2 | Unico History Owner | Append, cleanup e commit passano dal lane owner per client; merge e dedup sono verificati. | GS-002 risolto nel single-GM; limite multi-GM esplicito |
| 3 | Undo field-scoped e atomico | Prevalidazione, expected values, patch per campo e recovery evitano partial write nei percorsi coordinati. | GS-003 risolto nei percorsi coperti; GS-010 non assorbito |
| 4 | Lifecycle nei popup mutanti | Epoch, scene readiness, stale guards, cleanup e dispose sono montati sui popup transazionali. | GS-004 mitigato e coperto dai test |
| 5 | State gateway e Paragon | Patch serializzate dello state, toggle derivato dall'intenzione post-toggle e preservazione degli ID virtuali. | GS-007 risolto |
| 6 | Performance harness riproducibile | Driver Node/fake-OBR con fixture, metriche, smoke/full run, queue/lifecycle assertions e profili separati. | Misura strutturale riproducibile |
| 7 | Snapshot/bounds spaziali condivisi | Un servizio background con generation, cache bounds e snapshot condiviso tra spell/class/custom aura. | GS-005 risolto; non e' GS-007 |
| 8 | Fanout ristretto e snapshot riusati | Domini memory separati, metadata key-scoped, generation/recovery e full render senza filtered read duplicata. | GS-006, GS-008 e GS-009 risolti |

### Ultimo blocker di release: Undo e readiness

Il blocker riprodotto era in src/effectsMutations.js: una seconda notifica
ready=true entrava nel ramo di unload perche' la condizione era else if
(sceneReady). La guardia ora richiede !ready && sceneReady; quindi:

- true -> true non incrementa l'epoch e non invalida Undo;
- true -> false -> true invalida una sola volta e rimonta la scena;
- un unload reale continua a rendere stale il comando precedente;
- il dispose rimuove il listener produttivo.

I risultati Undo mantengono la convenzione array-decorated per compatibilita',
ma espongono anche status, committed e result: applied/committed, noop,
rejected, conflict, recovery-required e failed. Un array vuoto non e' piu'
interpretato da solo come successo.

History Modal ora consente successo soltanto per un commit reale, distingue gli
esiti non applicati e blocca il doppio submit. Quick HP conserva lastEntryId
su stale, no-op, rejected, conflict, recovery e failed; lo cancella solo dopo
un commit Undo reale.

## Evidenze misurate

- test/undoReleaseReadiness.test.js: **5/5**; include duplicate ready=true,
  recovery true -> false -> true, unload reale, risultati espliciti, contratti
  delle due UI e cleanup listener.
- Suite completa npm.cmd test: **1588/1588**; include i cinque test di
  release-readiness e tutti i test produttivi della roadmap.
- Harness full: correctness.ok=true, **1.735** chiamate SDK aggregate,
  queue stabilizzate, nessuna scrittura Player, nessuna contaminazione
  cross-scene e History senza duplicati.
- Harness Step 8 memoryInvalidation: 100 eventi HP numerici, condizioni,
  spell e classFeatureState con **0** candidate hydration; nel profilo completo
  6 quick-action candidates, 2 hydration, 1 registry/Room read, 3 legacy HP
  candidates, 1 scan, 0 full/filtered/id-scoped reads, 2 writes, 2 coalesced,
  403 skipped, 1 stale, 0 Player violations.
- Harness Step 8 metadataFanout: consumer aura spell/class/custom con 9
  eventi, 2 filtrati, 7 richieste, 2 coalesced, 5 pass completati e 1 recovery;
  static zone 9/3/6/2/4/1 negli stessi contatori principali. History-only e
  state semanticamente identico non propagano pass; lo state reale propaga una
  generation.
- Harness Step 8 fullRenderSnapshot: 3 fallback, 0 filtered e 0 id-scoped
  reads, 4 snapshot reuse, 7 commit, 0 stale, 1 coalesced; lo snapshot valido
  resta a 0 SDK reads.
- Spatial baseline: legacy/shared cold **120/40** bounds, movement **3/1**,
  scene switch **120/40**, warm **0/0**, zero-aura **120/0**. La lettura shared
  e' una volta per ID, non una bulk call inventata.
- Audit spells: catalogo **374/477**, 41 lacune P1 confermate, 67 integrazioni
  disconnesse e 2 fragili; fingerprint deterministico
  2142d01877cc6c81.
- Audit class features: 860 meccaniche, 551 record runtime, 0 runtime gap nei
  candidati token-marker.

## Traceability aggiornata

| Finding | Stato attuale |
| --- | --- |
| GS-001 | Risolto dallo Step 1. |
| GS-002 | Risolto per client/realm dallo Step 2; il multi-GM distribuito resta fuori contratto. |
| GS-003 | Risolto nei percorsi Undo coordinati dallo Step 3. |
| GS-004 | Mitigato dallo Step 4 con epoch/readiness/dispose. |
| GS-005 | Risolto dallo Step 7: snapshot spaziale/bounds condivisi. Questo e' il finding spaziale; non va etichettato GS-007. |
| GS-006 | Risolto dallo Step 8: invalidation memory per dominio. |
| GS-007 | Risolto dallo Step 5: Paragon/state gateway. |
| GS-008 | Risolto dallo Step 8: fanout metadata key-scoped. |
| GS-009 | Risolto dallo Step 8: full render snapshot reuse. |
| GS-010 | **P2 aperto**: restano writer diretti e coordinatori concorrenti su classFeatureState; non dichiarare il finding risolto. |
| GS-011 | P3 residuo: eviction globale delle mappe TTL movimento. |
| GS-012 | P3 adiacente: doppio bootstrap HP, da tenere sotto osservazione se riappare fuori dal percorso Step 8. |
| GS-013 | P3 residuo secondo l'audit storico. |

## Contratto operativo e limiti

Il contratto verificato e' un GM autorevole per scena. Il background/owner
serializza le mutation del proprio client e usa expected/stale/recovery per
impedire che una risposta vecchia scriva nel contesto corrente. Questo non e'
un protocollo distribuito: due GM possono ancora produrre commit validi in
ordine diverso e l'ultimo commit osservato prevale.

Resta obbligatorio non introdurre writer diretti per i domini gia' coordinati,
non sostituire metadata interi e non creare campi HP alternativi a
meta.hp/meta.hpMax. Le map attachment HP restano output derivati e non sono
una fonte dati.

## Gate manuale browser/Owlbear

Da eseguire con una scena di prova e con il build della release:

1. Aprire History Modal come GM, premere Undo due volte rapidamente e verificare
   un solo commit, nessun messaggio di successo con 0 azioni e nessun doppio
   cleanup.
2. Applicare HP da Quick HP, eseguire Undo reale, poi simulare un risultato
   stale/no-op/conflict e verificare che il pulsante e l'entry restino disponibili.
3. Durante un Undo cambiare scena e verificare che il vecchio comando sia
   rifiutato o marcato recovery-required senza scrivere nella nuova scena.
4. Verificare GM/Player: il Player puo' osservare output locali ma non scrive
   scene metadata, token metadata o History.
5. Verificare aura spell/class/custom, map HP bar, condizioni e reminder dopo
   cambio griglia, movimento, metadata change, reload e scena senza aura.
6. Se il prodotto dichiara multi-GM, eseguire due client GM concorrenti e
   considerare il risultato **NO-GO** finche' non esiste un owner distribuito o
   un protocollo di conflitto esplicito.

## Guardrail futuri

- **Incantesimi:** ogni nuovo workflow deve aggiornare catalogo, testo RAW,
  adapter, targeting, mutazioni, persistenza, reminder e audit; mantenere la
  distinzione tra coperto, manuale, disconnesso e fragile.
- **Capacita' classe:** ogni nuovo meccanismo deve dichiarare lane, ownership,
  expected field-scoped e lifecycle; non aggiungere writer diretti a
  classFeatureState senza test di concorrenza.
- **Ability scores:** normalizzare una sola fonte canonica e verificare
  propagazione token -> Room/UI senza scritture duplicate o fallback che
  sovrascrivano dati recenti.
- **Combat Log:** e' derivato e best-effort; un errore del log non deve
  trasformare un commit canonico in un falso fallimento, ne' un Undo deve
  riscrivere la History primaria come semplice effetto UI.
- **Nuovi popup mutanti:** montare sempre sceneLifecycle, catturare epoch e
  operation id prima del read, ricontrollare prima di ogni write e fare dispose
  di listener/timer/queue al close.

## Artefatti e riproducibilita'

I comandi degli audit sono stati eseguiti due volte con output identico. Gli
artefatti intenzionali sono data/spell-automation-audit.json e
docs/AUDIT_AUTOMAZIONE_INCANTESIMI.md; l'audit class features e' risultato
gia' deterministico senza una nuova variazione del markdown tracciato.

La verifica completa deve essere ripetuta con la sequenza documentata nel
report di consegna: test, version/spell checks, audit, smoke/full harness, build,
dist check, dependency tree e diff/status check. Il build warning noto e'
dimensionale (classFeatureCatalog circa 904 kB), non un errore di correttezza.
