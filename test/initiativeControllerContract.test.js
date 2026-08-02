import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
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
  const section = sourceSection(
    "const run = async () => {\n            const mutationPlan",
    "__roundEffectQueue = __roundEffectQueue.then(run, run);"
  );
  assertOrdered(section, [
    'type: "effects:tick-round"',
    "staticSpellZoneItemsEndedByPlan(",
    "await getStaticSpellZoneItems()",
    "commitWithStaticSpellZoneRemoval(",
    "const changedIds = await commitEffectsMutationPlan(mutationPlan, {",
    "isCurrent: (epoch) => __isCurrentSceneOperation(",
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
    "restoreEntry(entry, epoch)",
    "syncRestoredEntry(entry, epoch)",
    "recordCombatUndo(undoOrder, { sceneEpoch })",
    "const sceneEpoch = currentSceneEpoch();",
    "() => undoHistoryThroughNow(entryId, sceneEpoch)",
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
  assert.match(turnNoticeSource, /SAVE_REMINDER_AGGREGATION_MS/);
  assert.match(turnNoticeSource, /function queueSaveReminderNotices/);
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
