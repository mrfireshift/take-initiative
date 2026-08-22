import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
const normalizedSource = source.replace(/\r\n/g, "\n");
const turnNoticeSource = readFileSync(
  new URL("../src/turn-notice.ts", import.meta.url),
  "utf8"
);
const turnNoticeHostSource = readFileSync(
  new URL("../src/turnNoticeHost.js", import.meta.url),
  "utf8"
);
const backgroundSource = readFileSync(
  new URL("../src/background.js", import.meta.url),
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

test("il primo metadata di un nuovo scene epoch usa la baseline senza perdere il primo cambio", () => {
  const lifecycle = sourceSection(
    "function __mountSceneEpochLifecycle(renderCapability = null) {",
    "// Scansione e deduplicazione una tantum all'avvio."
  );
  assert.match(lifecycle, /createInitiativeReadinessHandshake\(/);
  assert.match(lifecycle, /subscribeReadiness: \(listener\) => OBR\.scene\.onReadyChange\(listener\)/);
  assert.match(lifecycle, /readInitialReadiness: \(\) => OBR\.scene\.isReady\(\)/);
  assert.match(lifecycle, /invalidateSceneEpoch\("scene-unload"\)/);
  assert.match(lifecycle, /markSceneEpochReady\(reason \|\| "scene-ready"\)/);
  assertOrdered(lifecycle, [
    "subscribeReadiness: (listener) => OBR.scene.onReadyChange(listener)",
    "readInitialReadiness: () => OBR.scene.isReady()",
    "void __sceneReadinessHandshake.mount()",
  ]);
  assert.doesNotMatch(lifecycle, /runtime-mount/);

  const metadata = sourceSection(
    "async function __processInitiativeMetadata(",
    "OBR.scene.onMetadataChange((meta) => {"
  );
  const baseline = metadata.indexOf("if (__sceneBaselineEpoch !== sceneEpoch)");
  const firstRoundTick = metadata.indexOf('mutationType: "effects:tick-round"');
  assert.ok(baseline >= 0, "manca il gate baseline del metadata");
  assert.ok(firstRoundTick > baseline, "il baseline deve precedere ogni tick di round");
  assertOrdered(metadata.slice(baseline, firstRoundTick), [
    "const previousState = __latestInitiativeState;",
    "await __adoptInitiativeSceneBaseline(",
    "!previousState",
    "if (!previousState || baselineDigest === stateDigest) return;",
  ]);
  assert.match(metadata.slice(baseline, firstRoundTick), /__lastQueuedInitiativeMetadataDigest = stateDigest;/);
});

test("il bootstrap separa setup UI e gate scene prima delle letture dipendenti dalla scena", () => {
  const boot = sourceSection(
    "OBR.onReady(async () => {",
    "await __mountTrackerSelectionSync();"
  );
  assertOrdered(boot, [
    "const sceneReadiness = __mountSceneEpochLifecycle(renderCapability);",
    "await OBR.player?.getRole?.()",
    "IS_GM = String(role).toUpperCase() === \"GM\";",
    "const readinessState = await sceneReadiness?.waitUntilReady();",
    "const bootstrapSceneEpoch = currentSceneEpoch();",
  ]);
  assert.match(boot, /if \(!readinessState\?\.ready\) return;/);
  assert.doesNotMatch(boot, /const bootstrapSceneEpoch = currentSceneEpoch\(\);\s*mountTracker/);
  assert.doesNotMatch(boot, /mountTurnNoticeBroadcast/);
});

test("il lifecycle baseline usa gli helper di stato nello scope modulo", async () => {
  const mountStart = normalizedSource.indexOf(
    "export function mountInitiativeList(container) {",
  );
  const activeStart = normalizedSource.indexOf("function __activeIdForState(state) {");
  const conditionStart = normalizedSource.indexOf(
    "function __conditionTurnStateSnapshot(state) {",
  );
  assert.ok(mountStart >= 0, "mountInitiativeList assente");
  assert.ok(activeStart >= 0 && activeStart < mountStart);
  assert.ok(conditionStart >= 0 && conditionStart < mountStart);
  assert.equal(
    (normalizedSource.match(/function __activeIdForState\s*\(/g) || []).length,
    1,
    "__activeIdForState deve avere una sola definizione canonica",
  );
  assert.equal(
    (normalizedSource.match(/function __conditionTurnStateSnapshot\s*\(/g) || []).length,
    1,
    "__conditionTurnStateSnapshot deve avere una sola definizione canonica",
  );
  assert.equal(
    normalizedSource.slice(mountStart).includes("function __activeIdForState(state)"),
    false,
    "__activeIdForState non deve tornare annidato in mountInitiativeList",
  );
  assert.equal(
    normalizedSource.slice(mountStart).includes("function __conditionTurnStateSnapshot(state)"),
    false,
    "__conditionTurnStateSnapshot non deve tornare annidato in mountInitiativeList",
  );

  const activeHelper = sourceSectionIn(
    normalizedSource,
    "function __activeIdForState(state) {",
    "function __conditionTurnStateSnapshot(state) {",
  );
  const conditionHelper = sourceSectionIn(
    normalizedSource,
    "function __conditionTurnStateSnapshot(state) {",
    "function __getInitiativeRenderScheduler() {",
  );
  const adoptBaseline = sourceSectionIn(
    normalizedSource,
    "async function __adoptInitiativeSceneBaseline(",
    "async function __acquireInitiativeSceneBaseline(",
  );
  const acquireBaseline = sourceSectionIn(
    normalizedSource,
    "async function __acquireInitiativeSceneBaseline(",
    "function __mountSceneEpochLifecycle(renderCapability = null) {",
  );

  const runBaseline = new Function(`
    let __sceneBaselineEpoch = null;
    let __lastInitiativeMetadataDigest;
    let __lastQueuedInitiativeMetadataDigest;
    let __latestInitiativeState = null;
    let __lastActiveId = null;
    let __lastTurnNoticeActiveId = null;
    let __lastRoundSeen = null;
    let __lastRoundSeenConfirmed = null;
    let __lastConditionTurnState = null;
    let __lastConditionTurnStateConfirmed = null;
    let __conditionNavigationHint = null;
    const STATE_KEY = "state";
    const state = { order: ["A", "B"], current: 1, round: 3 };
    const OBR = { scene: { getMetadata: async () => ({ [STATE_KEY]: state }) } };
    function __isCurrentSceneOperation() { return true; }
    function syncSpeedCheckTurn() {}
    function __initiativeDiag() {}
    function initiativeStateDigest(value) { return JSON.stringify(value); }
    ${activeHelper}
    ${conditionHelper}
    ${adoptBaseline}
    ${acquireBaseline}
    return (async () => {
      const acquired = await __acquireInitiativeSceneBaseline(7, "scene-ready", false);
      return {
        acquired,
        activeId: __lastActiveId,
        round: __lastRoundSeen,
        condition: __lastConditionTurnState,
      };
    })();
  `);

  const result = await runBaseline();
  assert.equal(result.acquired, true);
  assert.equal(result.activeId, "B");
  assert.equal(result.round, 3);
  assert.deepEqual(result.condition, {
    order: ["A", "B"],
    current: 1,
    round: 3,
  });
});

test("il baseline metadata precoce attende la capability render senza perdere l'update", async () => {
  const metadata = sourceSection(
    "async function __processInitiativeMetadata(",
    "OBR.scene.onMetadataChange((meta) => {",
  );
  assert.match(metadata, /renderCapability/);
  assert.match(metadata, /await renderCapability\("metadata"\)/);
  assert.match(
    normalizedSource,
    /const renderCapability = async \(reason\) => \{\s*await renderRuntimeReady;\s*return renderAll\(reason\);/s,
  );
  const listener = sourceSection(
    "OBR.scene.onMetadataChange((meta) => {",
    "subscribeSceneItemChanges(({ items }) => {",
  );
  assert.match(listener, /renderCapability,/);

  const activeHelper = sourceSectionIn(
    normalizedSource,
    "function __activeIdForState(state) {",
    "function __conditionTurnStateSnapshot(state) {",
  );
  const conditionHelper = sourceSectionIn(
    normalizedSource,
    "function __conditionTurnStateSnapshot(state) {",
    "function __getInitiativeRenderScheduler() {",
  );
  const adoptBaseline = sourceSectionIn(
    normalizedSource,
    "async function __adoptInitiativeSceneBaseline(",
    "async function __acquireInitiativeSceneBaseline(",
  );
  const acquireBaseline = sourceSectionIn(
    normalizedSource,
    "async function __acquireInitiativeSceneBaseline(",
    "function __mountSceneEpochLifecycle(renderCapability = null) {",
  );

  const runEarlyMetadata = new Function(`
    let __sceneBaselineEpoch = null;
    let __lastInitiativeMetadataDigest;
    let __lastQueuedInitiativeMetadataDigest;
    let __latestInitiativeState = null;
    let __lastActiveId = null;
    let __lastTurnNoticeActiveId = null;
    let __lastRoundSeen = null;
    let __lastRoundSeenConfirmed = null;
    let __lastConditionTurnState = null;
    let __lastConditionTurnStateConfirmed = null;
    let __conditionNavigationHint = null;
    let releaseRender;
    const renderReady = new Promise((resolve) => { releaseRender = resolve; });
    const renderCalls = [];
    const renderCapability = async (reason) => {
      await renderReady;
      renderCalls.push(reason);
      return { status: "committed" };
    };
    const STATE_KEY = "state";
    const state = { order: ["A", "B"], current: 1, round: 3 };
    const OBR = { scene: { getMetadata: async () => ({ [STATE_KEY]: state }) } };
    function __isCurrentSceneOperation() { return true; }
    function syncSpeedCheckTurn() {}
    function __initiativeDiag() {}
    function initiativeStateDigest(value) { return JSON.stringify(value); }
    ${activeHelper}
    ${conditionHelper}
    ${adoptBaseline}
    ${acquireBaseline}
    return (async () => {
      const pending = __acquireInitiativeSceneBaseline(
        7,
        "metadata",
        true,
        renderCapability,
      );
      await Promise.resolve();
      releaseRender();
      const acquired = await pending;
      return {
        acquired,
        renderCalls,
        activeId: __lastActiveId,
        round: __lastRoundSeen,
        condition: __lastConditionTurnState,
      };
    })();
  `);

  const result = await runEarlyMetadata();
  assert.equal(result.acquired, true);
  assert.deepEqual(result.renderCalls, ["scene-baseline"]);
  assert.equal(result.activeId, "B");
  assert.equal(result.round, 3);
  assert.deepEqual(result.condition, {
    order: ["A", "B"],
    current: 1,
    round: 3,
  });
});

test("il dirty flush degli editor condivide lo scope del renderer del tracker", () => {
  const mountStart = normalizedSource.indexOf("export function mountInitiativeList(container) {");
  const flushStart = normalizedSource.indexOf("function __scheduleEditorDirtyFlush()", mountStart);
  const renderStart = normalizedSource.indexOf('async function renderAll(reason = "unspecified")', mountStart);
  assert.ok(mountStart >= 0, "mountInitiativeList assente");
  assert.ok(flushStart > mountStart, "il dirty flush deve essere dichiarato dentro mountInitiativeList");
  assert.ok(renderStart > flushStart, "renderAll deve condividere lo scope del dirty flush");
  assert.equal(
    normalizedSource.indexOf("function __scheduleEditorDirtyFlush()"),
    flushStart,
    "non deve esistere un dirty flush top-level separato dal renderer",
  );
  const flush = normalizedSource.slice(flushStart, normalizedSource.indexOf("if (container.__initiativeMounted)", flushStart));
  assertOrdered(flush, [
    "const requiresFull = __fullRenderDirty;",
    'await renderAll("editor-close")',
    "await __requestIncrementalTrackerItems(",
    'if (!scheduled) await renderAll("editor-close-fallback")',
  ]);
});

test("le condizioni canoniche forzano la sincronizzazione completa della card", () => {
  const syncStart = normalizedSource.indexOf(
    "// Le condizioni cambiano poco frequentemente ma modificano struttura e altezza"
  );
  const quickActionStart = normalizedSource.indexOf(
    'if (!__isCurrentSceneOperation(sceneEpoch, "quick-action-restore")) return null;',
    syncStart,
  );
  assert.ok(syncStart >= 0, "manca il subscriber immediato per la sync condizioni/card");
  assert.ok(quickActionStart > syncStart, "il subscriber condizioni/card non e delimitabile");
  const sync = normalizedSource.slice(syncStart, quickActionStart);
  assertOrdered(sync, [
    'if (!__isCurrentSceneOperation(sceneEpoch, "condition-card-full-sync")) return;',
    "const trackedIds = (event?.items || [])",
    "__latestSceneItemEventRevision = Math.max(",
    "if (__suspendRenders || __editingInitForId || __editingHPForId) {",
    "__fullRenderDirty = true;",
    'void renderAll("conditions-canonical")',
    "filter: (event) => event.flags.conditions,",
    "immediate: true,",
  ]);
});

test("il bootstrap acquisisce il turno corrente senza inviare un reminder", () => {
  const boot = sourceSection(
    "const bootPersistedState = await getSceneState();",
    "void recordCombatTurn(__latestInitiativeState",
  );
  assertOrdered(boot, [
    "await __adoptInitiativeSceneBaseline(",
  ]);
  assert.doesNotMatch(boot, /broadcastTurnNotice\(/);
});

test("il background apre il turn notice on demand e lo chiude quando è invisibile", () => {
  const sender = sourceSection(
    "let __turnNoticeSequence = 0;",
    "async function showConcentrationDamageWarning("
  );
  assert.doesNotMatch(sender, /mountTurnNoticeBroadcast|__turnNoticeReady|__pendingTurnNotice/);
  assert.match(sender, /return __turnNoticeDelivery\.request\(notice, sceneEpoch/);
  assert.match(sender, /__lastTurnNoticeDeliveryKey = event\.key/);
  assert.doesNotMatch(sender, /__lastTurnNoticeDeliveryKey = deliveryKey/);
  assert.match(backgroundSource, /mountTurnNoticeHost\(\)/);
  assert.match(turnNoticeHostSource, /enqueueTurnNoticeHostPayload\(pendingPayloads, payload\)/);
  assert.match(turnNoticeHostSource, /await openTurnNoticePopover\(pendingPayloads\[0\]\)/);
  const receiveNotice = sourceSectionIn(
    turnNoticeHostSource,
    "function receiveNoticePayload(payload)",
    "function receiveReadyMessage(payload)",
  );
  assert.doesNotMatch(receiveNotice, /enqueueHostTask/);
  assert.ok(
    receiveNotice.indexOf("enqueueTurnNoticeHostPayload")
      < receiveNotice.indexOf("scheduleNoticePump()"),
  );
  assert.match(turnNoticeHostSource, /OBR\.popover\.open\(\{/);
  assert.match(turnNoticeHostSource, /OBR\.popover\.close\(TURN_NOTICE_POPOVER_ID\)/);
  assert.match(turnNoticeHostSource, /TURN_NOTICE_UI_CHANNEL/);
  assert.match(turnNoticeHostSource, /TURN_NOTICE_READY_CHANNEL/);
  assert.match(turnNoticeHostSource, /await OBR\.popover\.close\(TURN_NOTICE_POPOVER_ID\)/);
  assert.match(turnNoticeHostSource, /popoverOpen = false/);
  const hostMount = turnNoticeHostSource.slice(
    turnNoticeHostSource.indexOf("export function mountTurnNoticeHost()"),
  );
  assert.doesNotMatch(hostMount, /OBR\.popover\.open\(/);
  assert.match(hostMount, /OBR\.popover\.close\(TURN_NOTICE_POPOVER_ID\)/);

  assertOrdered(turnNoticeSource, [
    "unsubscribeUiBroadcast = OBR.broadcast.onMessage(UI_CHANNEL",
    "unsubscribeTurnNoticeReadyRequest = OBR.broadcast.onMessage(",
    "void announceReady();",
  ]);
  assert.match(turnNoticeSource, /type: "turn-notice-ready"/);
  assert.match(turnNoticeSource, /sceneEpoch: noticeSceneEpoch/);
  assert.match(turnNoticeSource, /noticeSceneEpoch = Math\.floor\(requestedEpoch\)/);
  assert.match(turnNoticeSource, /destination: "LOCAL"/);
});

test("il reminder di turno precede render e tick; i TS restano al solo background", () => {
  const metadata = sourceSection(
    "async function __processInitiativeMetadata(",
    "OBR.scene.onMetadataChange((meta) => {"
  );
  assertOrdered(metadata, [
    "const noticeActiveId = __activeIdForState(st);",
    "isInitiativeTurnTransition(",
    "const transitionSeq = ++__temporalTransitionSequence;",
    "const temporalDescriptors = [];",
    "void __enqueueInitiativeTemporalDescriptor(",
    'await renderCapability("metadata")',
    'if (!__isCurrentSceneOperation(sceneEpoch, "condition-turn-tick"',
  ]);
  assert.match(metadata, /temporalCapture: true/);
  assert.match(metadata, /metadata:temporal-captured-stale-navigation/);
  assert.doesNotMatch(metadata, /sceneMetadataPreconditions/);
  assert.equal(
    (metadata.match(/broadcastTurnNotice\(st, sceneEpoch, \{ source: "metadata" \}\)/g) || []).length,
    1,
  );
  assert.doesNotMatch(metadata, /await runEffectsMutation\(\[operation\]/);
  assert.doesNotMatch(source, /__broadcastEffectSaveReminderTransition/);
  assert.doesNotMatch(source, /planEffectSaveReminderNotices/);

  const navigation = sourceSection(
    "async function __flushNavigationState()",
    "function queueNavigationState("
  );
  assertOrdered(navigation, [
    "const applied = await setSceneState({",
    'kind: "advance-turn"',
    "if (!initiativeStateResultApplied(applied)) return;",
    "shouldSuppressTurnNoticeBroadcast({",
    'broadcastTurnNotice(desired, sceneEpoch, { source: "navigation" })',
  ]);
  assert.equal((source.match(/prewarmSpeedCheckTurn\(next\)/g) || []).length, 2);
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

test("il full render condivide il raw item snapshot tra tracker e spell board", () => {
  const render = sourceSection(
    "async function __executeFullRenderRequest(request)",
    "OBR.onReady(async () => {",
  );
  assert.match(render, /const itemSnapshot = readSceneItemsSnapshot\(sceneEpoch\);/);
  assert.match(render, /readFullRenderItemSnapshot\(/);
  assert.match(render, /const rawItems = itemRead\.items;/);
  assert.match(render, /getEntriesWithLair\(stateRaw, rawItems\)/);
  assert.match(render, /spellBoardTokenTrackerItems\(rawItems\)/);
  assert.doesNotMatch(render, /getSpellBoardTokenItems\(/);
  assert.match(render, /sourceGeneration: request\?\.sourceGeneration/);
});

test("la scadenza naturale degli incantesimi elimina atomicamente le zone concluse", () => {
  const section = sourceSectionIn(
    normalizedSource,
    "async function __applyInitiativeTemporalDescriptor(descriptor)",
    "function __enqueueInitiativeTemporalDescriptor(descriptor)"
  );
  assertOrdered(section, [
    "const mutationType = descriptor.mutationType;",
    "const commandId = mutationType ===",
    'kind: mutationType',
    '...(mutationType === "effects:tick-round" ? { history: false } : {})',
    "commandId,",
    'sideEffects: [{',
    "selectors: [{ all: true }]",
    'type: mutationType',
    "operationId: `${commandId}:operation`",
    "requireAppliedEffectsMutation(mutation)",
  ]);
  assert.doesNotMatch(section, /sceneMetadataPreconditions/);
  assert.match(section, /mutationType === "effects:tick-round" \? \{ history: false \} : \{\}/);
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
  assert.match(turnNoticeSource, /isTurnNoticeForScene\(data, noticeSceneEpoch, noticeSceneReady\)/);
  const lifecycle = sourceSectionIn(
    turnNoticeSource,
    "unsubscribeZoneSceneReady = OBR.scene.onReadyChange((ready) => {",
    "announceNoticeLayout();\n  if (!SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) return;"
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
  assert.match(turnNoticeSource, /requestPendingZoneNoticeSync\(\);/);
  assert.doesNotMatch(turnNoticeSource, /unsubscribeZoneItems/);
  assert.doesNotMatch(turnNoticeSource, /OBR\.scene\.items\.onChange\(/);
  assert.doesNotMatch(turnNoticeSource, /PENDING_SYNC_INTERVAL_MS|setInterval/);
  assert.match(turnNoticeSource, /app\.replaceChildren\(panel\)/);
  assert.match(turnNoticeSource, /function clearZoneNotice\(\)/);
  const turnNotice = sourceSectionIn(
    turnNoticeSource,
    "function showNotice(raw: any)",
    "function renderSaveReminderBatch(batch: any)",
  );
  assert.match(turnNotice, /shouldClearZoneNoticeAtTurn\(currentZoneTurnKey, notice\.turnKey\)/);
  assert.match(turnNotice, /clearZoneNotice\(\)/);
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
  assert.doesNotMatch(source, /mountTurnNoticeBroadcast|TURN_NOTICE_POPOVER_ID/);
  assert.match(turnNoticeHostSource, /OBR\.broadcast\.onMessage\(SPELL_ZONE_TRIGGER_NOTICE_CHANNEL/);
  assert.match(turnNoticeHostSource, /height: initialPopoverHeight\(payload\)/);
  assert.match(turnNoticeHostSource, /await OBR\.popover\.close\(TURN_NOTICE_POPOVER_ID\)/);
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
