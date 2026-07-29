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

test("i reminder di zona restano scollegati mentre il layer del turno continua a funzionare", () => {
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
    "await reconcileStateWithItems();",
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
    "async function ensureState() {"
  );

  assert.match(adapter, /return buildClassicTrackerCard\(entry,\s*\{/);
  assert.match(render, /buildClassicTrackerCardForRender\(entry,\s*state,\s*nextId\)/);
});
