import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
const normalizedSource = source.replace(/\r\n/g, "\n");
const turnNoticeSource = readFileSync(
  new URL("../src/turn-notice.ts", import.meta.url),
  "utf8"
);
const classicBuilderSource = readFileSync(
  new URL("../src/initiativeCardClassicBuilder.js", import.meta.url),
  "utf8"
);
const historySource = readFileSync(new URL("../src/history.js", import.meta.url), "utf8");

function sourceSectionIn(sourceText, startMarker, endMarker) {
  const start = sourceText.indexOf(startMarker);
  const end = sourceText.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `marker iniziale assente: ${startMarker}`);
  assert.ok(end > start, `marker finale assente: ${endMarker}`);
  return sourceText.slice(start, end);
}

function sourceSection(startMarker, endMarker) {
  return sourceSectionIn(source, startMarker, endMarker);
}

function assertOrdered(section, markers) {
  let previous = -1;
  for (const marker of markers) {
    const position = section.indexOf(marker);
    assert.ok(position >= 0, `contratto assente: ${marker}`);
    assert.ok(position > previous, `ordine del contratto cambiato: ${marker}`);
    previous = position;
  }
}

test("il controller reale serializza gli eventi metadata prima di processarli", () => {
  const section = sourceSection(
    "OBR.scene.onMetadataChange((meta) => {",
    "subscribeSceneItemChanges(({ items }) => {"
  );
  assertOrdered(section, [
    "const metadataRevision = ++__initiativeMetadataRevision;",
    "const run = () => __processInitiativeMetadata",
    "__initiativeMetadataProcessor.enqueue(run)",
  ]);
});

test("il primo metadata di un nuovo scene epoch viene acquisito come baseline", () => {
  const lifecycle = sourceSection(
    "function __mountSceneEpochLifecycle() {",
    "// Scansione e deduplicazione una tantum all'avvio."
  );
  assert.match(lifecycle, /OBR\.scene\.onReadyChange\(\(ready\) =>/);
  assert.match(lifecycle, /invalidateSceneEpoch\("scene-unload"\)/);
  assert.match(lifecycle, /markSceneEpochReady\("scene-ready"\)/);
  assert.match(
    lifecycle,
    /void __acquireInitiativeSceneBaseline\(initialEpoch, "runtime-mount", false\)\.catch/,
  );

  const metadata = sourceSection(
    "async function __processInitiativeMetadata(",
    "OBR.scene.onMetadataChange((meta) => {"
  );
  const baseline = metadata.indexOf("if (__sceneBaselineEpoch !== sceneEpoch)");
  const firstRoundTick = metadata.indexOf('type: "effects:tick-round"');
  assert.ok(baseline >= 0, "manca il gate baseline del metadata");
  assert.ok(firstRoundTick > baseline, "il baseline deve precedere ogni tick di round");
  assert.match(
    metadata.slice(baseline, firstRoundTick),
    /await __adoptInitiativeSceneBaseline\([\s\S]*?return;/,
  );
});

test("la baseline anticipata non blocca ruolo GM e bootstrap del tracker", () => {
  const boot = sourceSection(
    "OBR.onReady(async () => {",
    "await __mountTrackerSelectionSync();"
  );
  assertOrdered(boot, [
    "__mountSceneEpochLifecycle();",
    "const bootstrapSceneEpoch = currentSceneEpoch();",
    "await mountTurnNoticeBroadcast()",
    "await OBR.player?.getRole?.()",
    "IS_GM = String(role).toUpperCase() === \"GM\";",
  ]);
  assert.doesNotMatch(boot, /await __mountSceneEpochLifecycle\(\)/);
});

test("il bootstrap invia il reminder anche per la prima card attiva", () => {
  const boot = sourceSection(
    "const bootPersistedState = await getSceneState();",
    "if (IS_GM) {\n    void recordCombatTurn",
  );
  assertOrdered(boot, [
    "const bootInitialState = __latestInitiativeState || bootPersistedState;",
    "await __adoptInitiativeSceneBaseline(",
    "__activeIdForState(bootInitialState)",
    "broadcastTurnNotice(bootInitialState, bootstrapSceneEpoch)",
  ]);
});

test("il modal conferma il listener e conserva il primo notice durante il reload", () => {
  const sender = sourceSection(
    "let __turnNoticeListenerMounted = false;",
    "async function showConcentrationDamageWarning("
  );
  assertOrdered(sender, [
    "OBR.broadcast.onMessage(TURN_NOTICE_READY_CHANNEL",
    "await OBR.modal.open({",
    "turn-notice-ready-request",
  ]);
  assert.match(sender, /if \(!__turnNoticeReady\) \{\s*__pendingTurnNotice = \{ notice, sceneEpoch \};/);
  assert.match(sender, /__sendTurnNoticePayload\(pending\.notice, pending\.sceneEpoch\)/);
  assert.match(sender, /const deliveryKey = `\$\{sceneEpoch\}:\$\{notice\.turnKey\}`/);

  assertOrdered(turnNoticeSource, [
    "unsubscribeTurnNoticeBroadcast = OBR.broadcast.onMessage(CHANNEL",
    "unsubscribeTurnNoticeReadyRequest = OBR.broadcast.onMessage(",
    "void announceReady();",
  ]);
  assert.match(turnNoticeSource, /type: "turn-notice-ready"/);
  assert.match(turnNoticeSource, /destination: "LOCAL"/);
});

test("il reminder di turno precede render e tick senza duplicare il broadcast", () => {
  const metadata = sourceSection(
    "async function __processInitiativeMetadata(",
    "OBR.scene.onMetadataChange((meta) => {"
  );
  assertOrdered(metadata, [
    "const noticeActiveId = __activeIdForState(st);",
    "broadcastTurnNotice(st, sceneEpoch)",
    'await renderAll("metadata")',
    "await roundEffectAdjustment",
    'type: "effects:tick-boundaries"',
  ]);
  assert.equal(
    (metadata.match(/broadcastTurnNotice\(st, sceneEpoch\)/g) || []).length,
    1,
  );
});

test("il cambio scena scarta il render tardivo e usa il primo snapshot history come baseline", () => {
  const render = sourceSection(
    "async function renderAll(reason = \"unspecified\") {",
    "OBR.onReady(async () => {"
  );
  const renderRead = render.indexOf("const stateRaw = await getSceneState();");
  const staleRenderGuard = render.indexOf('"render-read-state"');
  const renderCommit = render.indexOf("renderTrack(ordered, stateClean");
  assert.ok(renderRead >= 0 && staleRenderGuard > renderRead);
  assert.ok(renderCommit > staleRenderGuard);

  const watcherStart = historySource.indexOf("export async function mountSceneHistoryWatcher()");
  const watcherEnd = historySource.indexOf("async function appendEntryNow", watcherStart);
  const watcher = historySource.slice(watcherStart, watcherEnd);
  const baseline = watcher.indexOf("if (__sceneHistoryBaselineEpoch === eventEpoch)");
  const diff = watcher.indexOf("sceneTokenHistoryChange");
  const append = watcher.indexOf("appendSceneHistoryChanges(pending, eventEpoch)");
  assert.ok(baseline >= 0 && diff > baseline && append > baseline);
});

test("la scadenza naturale degli incantesimi elimina atomicamente le zone concluse", () => {
  const section = sourceSectionIn(
    normalizedSource,
    "const run = async () => {\n            if (!__isCurrentSceneOperation(sceneEpoch, \"round-tick\"",
    "roundEffectAdjustment = run();"
  );
  assertOrdered(section, [
    "const mutation = await runEffectsMutation([{",
    'type: "effects:tick-round"',
    "sceneMetadataPreconditions: [{ key: STATE_KEY, value: st }]",
    'type: "static-zone:remove-ended"',
    "selectors: [{ all: true }]",
    "requireAppliedEffectsMutation(mutation)",
  ]);
});

test("la riconciliazione reale propaga lo scene epoch a GC e backfill", () => {
  const section = sourceSection(
    "async function reconcileStateWithItems(",
    "// --- DnD helper:"
  );
  assert.match(section, /async function reconcileStateWithItems\(sceneEpoch = currentSceneEpoch\(\)\)/);
  assertOrdered(section, [
    "runSceneEpochSteps({",
    "(epoch) => __gcSeededGroups(epoch)",
    "(epoch) => __backfillInitiativeForSeededGroups(epoch)",
  ]);
});

test("Undo cattura l'epoch prima della coda e lo propaga a restore e sync", () => {
  const section = sourceSectionIn(
    historySource,
    "async function undoHistoryThroughNow(",
    "export async function undoLastHistoryEntry()"
  );
  assertOrdered(section, [
    "async function undoHistoryThroughNow(entryId, sceneEpoch)",
    "const coordinatedBatch = undoOrder.some(entryTouchesEffects)",
    "const { undoEffectsMutation } = await import(\"./effectsMutations.js\")",
    "const mutation = await undoEffectsMutation(undoOrder,",
    "commandId: undoCommandId",
    "syncRestoredEntry({",
    "recordCombatUndo(undoOrder, { sceneEpoch })",
    "const sceneEpoch = currentSceneEpoch();",
    "() => undoHistoryThroughNow(entryId, sceneEpoch)",
  ]);
  assertOrdered(section, [
    "restoreEntry(entry, epoch)",
    "syncRestoredEntry(entry, epoch)",
  ]);
});

test("il turn notice porta lo scene epoch e viene cancellato all'unload", () => {
  const sender = sourceSection(
    "async function broadcastTurnNotice(",
    "async function showConcentrationDamageWarning("
  );
  assert.match(sender, /sceneEpoch,/);
  assert.match(sender, /__isCurrentSceneOperation\(sceneEpoch, "turn-notice"\)/);
  assert.match(turnNoticeSource, /isTurnNoticeForScene\(event\.data, noticeSceneEpoch, noticeSceneReady\)/);
  const lifecycle = sourceSectionIn(
    turnNoticeSource,
    "unsubscribeZoneSceneReady = OBR.scene.onReadyChange((ready) => {",
    "unsubscribeZoneBroadcast = OBR.broadcast.onMessage("
  );
  assertOrdered(lifecycle, [
    "noticeSceneEpoch += 1;",
    "noticeSceneReady = false;",
    "clearTurnNotice();",
    "noticeSceneReady = true;",
  ]);
});

test("i reminder di zona usano il layer persistente del turno senza un secondo popover", () => {
  for (const marker of [
    "ZONE_TRIGGER_NOTICE_MODAL_ID",
    "reopenZoneTriggerNoticeLayer",
    "mountZoneTriggerNoticeBroadcast",
    "/zone-trigger-notice.html",
  ]) {
    assert.equal(
      source.includes(marker),
      false,
      `initiativeList non deve gestire il lifecycle zona: ${marker}`
    );
  }

  assert.match(turnNoticeSource, /SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED/);
  assert.match(
    turnNoticeSource,
    /if \(!SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED\) return;/
  );
  assert.ok(
    turnNoticeSource.indexOf("if (!SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) return;")
      < turnNoticeSource.indexOf("unsubscribeZoneItems ="),
  );
  assert.doesNotMatch(turnNoticeSource, /PENDING_SYNC_INTERVAL_MS|setInterval/);
  assert.match(turnNoticeSource, /app\.replaceChildren\(panel\)/);
  assert.match(turnNoticeSource, /function clearZoneNotice\(\)/);
  assert.match(turnNoticeSource, /mergeSaveReminderNoticeBatch/);
  assert.match(turnNoticeSource, /SAVE_REMINDER_AGGREGATION_MS = 16/);
  assert.match(turnNoticeSource, /function queueSaveReminderNotices/);
  assert.doesNotMatch(
    turnNoticeSource,
    /requestAnimationFrame\(\(\) => requestAnimationFrame/,
  );
  assert.match(turnNoticeSource, /function clearTurnNotice\(\)/);
  assert.doesNotMatch(turnNoticeSource, /Apri Effetti ad Area per risolvere/);
  assert.doesNotMatch(turnNoticeSource, /zone-target-badge/);
});

test("HP immediati e rendering incrementale restano separati dal fallback globale", () => {
  const hpSection = sourceSection(
    "subscribeSceneItemChanges(({ items }) => {",
    "subscribeSceneItemChanges(async (event) => {"
  );
  assert.match(hpSection, /syncTrackerHPNow\(item\.id, meta\.hp, meta\.hpMax\)/);
  assert.match(hpSection, /immediate:\s*true/);

  const trackerSection = sourceSection(
    "subscribeSceneItemChanges(async (event) => {",
    "// \u2014\u2014\u2014 Auto-ripristino HP"
  );
  assertOrdered(trackerSection, [
    "const renderPlan = planIncrementalTrackerItemRender(event);",
    "__renderIncrementalTrackerItems(event, renderPlan, \"items\")",
    "await reconcileStateWithItems(sceneEpoch);",
    "await enforceUniqueNamePrefixes();",
    "await renderAll(",
  ]);
});

test("il rendering incrementale aggiorna la cache e conserva il fallback strutturale", () => {
  const section = sourceSection(
    "function __cachedEntriesForIncrementalItems(items, state) {",
    "async function renderAll(reason = \"unspecified\") {"
  );
  assertOrdered(section, [
    "entryFromSceneItem(item)",
    "expandParagonEntries([entry], state)",
    "renderTrack(cached.ordered, state",
    "__activeLabelEntriesById = cached.nextById;",
    "__initiativeDiag(\"render:incremental-committed\"",
  ]);
});

test("il render reale conserva revisioni stale e guard degli editor", () => {
  const section = sourceSection(
    "async function renderAll(reason = \"unspecified\") {",
    "OBR.onReady(async () => {"
  );
  assertOrdered(section, [
    "const renderRevision = ++__renderRequestRevision;",
    "isCurrentRenderRevision(renderRevision, __latestAcceptedRenderRevision)",
    "if (__editingInitForId || __editingHPForId)",
    "renderTrack(ordered, stateClean",
    "__initiativeDiag(\"render:committed\"",
  ]);
  assert.match(
    section,
    /__initiativeDiag\("render:committed",\s*\{[\s\S]*?durationMs:\s*renderDurationMs\(\)/
  );
});

test("la card classica non monta le pill buff e debuff dello spell", () => {
  const section = sourceSectionIn(
    classicBuilderSource,
    "// 2) Incantesimi",
    "// 3) Monta TUTTO assieme"
  );

  assert.doesNotMatch(section, /buildSpellEffectChips/);
  assert.match(section, /fragAll\.appendChild\(fragSp\)/);
});

test("il renderer classico delega la costruzione completa al builder estratto", () => {
  const adapter = sourceSection(
    "function buildClassicTrackerCardForRender(entry, state, nextId) {",
    "function renderTrack(entries, state, opts = {}) {"
  );
  const render = sourceSection(
    "function renderTrack(entries, state, opts = {}) {",
    "async function ensureState("
  );

  assert.match(adapter, /return buildClassicTrackerCard\(entry,\s*\{/);
  assert.match(render, /buildClassicTrackerCardForRender\(entry,\s*state,\s*nextId\)/);
});
