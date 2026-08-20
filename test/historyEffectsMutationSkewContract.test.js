import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const effectsSource = readFileSync(new URL("../src/effectsMutations.js", import.meta.url), "utf8");
const historySource = readFileSync(new URL("../src/history.js", import.meta.url), "utf8");

test("History pending API richiesta da history.js e' esportata da effectsMutations.js", () => {
  assert.match(historySource, /hasPendingEffectsHistory/);
  assert.match(historySource, /flushPendingEffectsHistory/);
  assert.match(effectsSource, /export function hasPendingEffectsHistory\s*\(/);
  assert.match(effectsSource, /export function flushPendingEffectsHistory\s*\(/);
});

test("prepareEffectsMutationUndo usa solo il planner History canonico", () => {
  const start = effectsSource.indexOf("export async function prepareEffectsMutationUndo");
  const end = effectsSource.indexOf("\nfunction normalizedSceneItem", start);
  const block = effectsSource.slice(start, end > start ? end : start + 7000);
  assert.match(block, /buildHistoryUndoPlan\s*\(/);
  assert.doesNotMatch(block, /buildCoordinatedEffectsUndoPlan\s*\(/);
});

test("runEffectsMutation locale conserva e ritenta una History deferred", () => {
  const start = effectsSource.indexOf("export async function runEffectsMutation");
  const end = effectsSource.indexOf("\nexport async function undoEffectsMutation", start);
  const block = effectsSource.slice(start, end);
  assert.match(block, /historyPending/);
  assert.match(block, /pendingHistoryRecords\.set\s*\(/);
  assert.match(block, /enqueuePendingEffectsPostCommitRetry\s*\(/);
});

test("metadataPatches puo distinguere la precondizione live dallo snapshot compatto usato da History", () => {
  const start = effectsSource.indexOf("function applyMetadataPatchesToPlan");
  const end = effectsSource.indexOf("\nfunction expandStateDependentOperations", start);
  const block = effectsSource.slice(start, end);
  assert.match(block, /descriptor\?\.historyBefore/);
  assert.match(block, /change\.beforeMetadata\[field\]/);
  assert.match(block, /metadataSnapshotMatches\(actual, descriptor\?\.expected\)/);
});


test("la barrier History dei client consulta il runtime background autorevole", () => {
  assert.match(effectsSource, /export async function hasPendingEffectsHistoryAuthoritative\s*\(/);
  assert.match(historySource, /hasPendingEffectsHistoryAuthoritative/);
  assert.match(effectsSource, /getContextState:\s*\(\)\s*=>/);
  assert.match(effectsSource, /const historyPending = hasPendingEffectsHistory\(currentSceneEpoch\(\)\)/);
});

test("un Undo background non può superare una History Effects ancora pending", () => {
  const mountStart = effectsSource.indexOf("export async function mountEffectsMutationCoordinatorService");
  const mountBlock = effectsSource.slice(mountStart, mountStart + 9000);
  assert.match(mountBlock, /executeUndo:\s*async/);
  assert.match(mountBlock, /hasPendingEffectsHistory\(currentSceneEpoch\(\)\)/);
  assert.match(mountBlock, /reason:\s*["']history-pending["']/);
  assert.match(mountBlock, /shouldCacheResult/);
  assert.match(mountBlock, /history-pending/);
});

test("la readiness non rivalida come conflitto entry già committate ma pending removal", () => {
  assert.match(historySource, /filterPendingHistoryRemovalEntries/);
  assert.match(historySource, /pendingHistoryRemovalIds/);
});
