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
    "function __mountSceneEpochLifecycle() {",
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
  const firstRoundTick = metadata.indexOf('type: "effects:tick-round"');
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
    "const sceneReadiness = __mountSceneEpochLifecycle();",
    "await OBR.player?.getRole?.()",
    "IS_GM = String(role).toUpperCase() === \"GM\";",
    "const readinessState = await sceneReadiness?.waitUntilReady();",
    "const bootstrapSceneEpoch = currentSceneEpoch();",
  ]);
  assert.match(boot, /if \(!readinessState\?\.ready\) return;/);
  assert.doesNotMatch(boot, /const bootstrapSceneEpoch = currentSceneEpoch\(\);\s*mountTracker/);
  assert.doesNotMatch(boot, /mountTurnNoticeBroadcast/);
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
  assert.match(sender, /return __sendTurnNoticePayload\(notice, sceneEpoch\)/);
  assert.match(sender, /const deliveryKey = `\$\{sceneEpoch\}:\$\{notice\.turnKey\}`/);
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
    "broadcastTurnNotice(st, sceneEpoch)",
    'await renderAll("metadata")',
    "await roundEffectAdjustment",
    'type: "effects:tick-boundaries"',
  ]);
  assert.equal(
    (metadata.match(/broadcastTurnNotice\(st, sceneEpoch\)/g) || []).length,
    1,
  );
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
    "broadcastTurnNotice(desired, sceneEpoch)",
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
