import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `marker iniziale assente: ${startMarker}`);
  assert.ok(end > start, `marker finale assente: ${endMarker}`);
  return source.slice(start, end);
}

const quickHPSource = read("../src/quick-hp-modal.js");
const historySource = read("../src/history.js");
const memorySource = read("../src/hpMemory.js");
const barsSource = read("../src/hpbar-items.js");

test("la Console HP avvia la preview batch prima del commit e recupera dallo stato autorevole", () => {
  const apply = section(
    quickHPSource,
    "async function applyOperation() {",
    "async function undoLastOperation() {",
  );
  const preview = apply.indexOf("createQuickHPVisualTransaction(optimisticUpdates");
  const commit = apply.indexOf("await withItemMetaHistory({");
  assert.ok(preview >= 0 && commit > preview);
  assert.match(apply, /hpVisualTransaction\.recover\(\(itemIds\) =>/);
  assert.match(
    apply,
    /readAuthoritativeHPVisualUpdates\(\s*itemIds,\s*operationSceneEpoch,\s*\(\) => sceneLifecycle\.isCurrent\(operation\),\s*\)/,
  );
  assert.match(apply, /await Promise\.all\(\[/);
  assert.ok(
    apply.indexOf("await Promise.all([")
      > apply.indexOf("if (hpVisualTransaction) await hpVisualTransaction.completion;"),
  );
  assert.match(apply, /syncHPBatchToMemory\(entries\.map/);
  assert.match(apply, /showConcentrationWarnings\(entries\)/);
  assert.match(apply, /showEffectSaveDamageWarnings\(entries\)/);
  assert.doesNotMatch(apply, /await saveHPToMemoryByItemId/);
});

test("le barre HP seguono i token senza riletture globali sui metadata di scena", () => {
  const mount = section(
    barsSource,
    "export async function mountHPBars()",
    "export function syncHPBarNow(",
  );
  assert.match(mount, /await queueCanonicalHPItems\(\)/);
  assert.match(mount, /OBR\.scene\.onReadyChange/);
  assert.match(mount, /subscribeSceneItemChanges/);
  assert.doesNotMatch(mount, /OBR\.scene\.onMetadataChange/);
});

test("l'Undo sincronizza testo, rimozioni e memoria per lotto", () => {
  const sync = section(
    historySource,
    "async function syncRestoredEntry(entry, sceneEpoch) {",
    "function entryTouchesEffects(entry) {",
  );
  assert.match(sync, /Promise\.allSettled\(\[/);
  assert.match(sync, /bars\.syncHPTextBatchNow\(textUpdates\)/);
  assert.match(sync, /bars\.removeHPWidgetsBatchNow\(removedWidgetIds\)/);
  assert.match(sync, /memory\.syncHPBatchToMemory\(memoryUpdates, \{ sceneEpoch, items \}\)/);
  assert.doesNotMatch(sync, /bars\.syncHPTextNow\(/);
  assert.doesNotMatch(sync, /memory\.(?:saveHPToMemoryByItemId|removeHPFromMemoryByItemId)\(/);
});

test("la memoria HP salva o rimuove un lotto con un solo write nella lane esistente", () => {
  const batch = section(
    memorySource,
    "export async function syncHPBatchToMemory(",
    "export async function saveHPToMemoryByItemId(",
  );
  assert.equal((batch.match(/writeRoomHPMap\(/g) || []).length, 1);
  assert.match(batch, /for \(const update of memoryUpdates\)/);
  assert.match(batch, /delete m\[update\.key\]/);

  const wrappers = section(
    memorySource,
    "export async function saveHPToMemoryByItemId(",
    "export async function applyHPMemoryToSceneForMissingHP(",
  );
  assert.equal((wrappers.match(/syncHPBatchToMemory\(/g) || []).length, 2);
});

test("la rimozione dei widget HP risolve e cancella tutti i target in un batch", () => {
  const removeBatch = section(
    barsSource,
    "export async function removeHPWidgetsBatchNow(",
    "export async function mountHPBars()",
  );
  assert.equal((removeBatch.match(/OBR\.scene\.items\.getItems\(/g) || []).length, 1);
  assert.equal((removeBatch.match(/OBR\.scene\.items\.deleteItems\(/g) || []).length, 1);
  assert.match(removeBatch, /return removeHPWidgetsBatchNow\(\[tokenId\]\)/);
});
