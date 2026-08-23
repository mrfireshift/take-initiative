import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/embersMatchedVisualRenderer.js", import.meta.url),
  "utf8",
);

function functionBlock(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const next = source.indexOf("\nfunction ", start + 1);
  const nextAsync = source.indexOf("\nasync function ", start + 1);
  const candidates = [next, nextAsync].filter((value) => value >= 0);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

test("VFX-001A: il renderer non sintetizza più fallback outro generici", () => {
  assert.doesNotMatch(source, /FALLBACK_FADE_OUTRO/u);
  assert.doesNotMatch(source, /fallback-fade/u);
  assert.doesNotMatch(source, /fadeLifecycleVisuals/u);
  assert.doesNotMatch(source, /MarkerLightOutro_01_Regular_Blue/u);
});

test("VFX-001A: un end senza outro esplicito rimuove direttamente il loop", () => {
  const block = functionBlock("renderEvent");
  assert.match(
    block,
    /if \(layers\.length > 0\)[\s\S]*?scheduleIndependent\(clear, OUTRO_CROSSFADE_MS\);[\s\S]*?else \{[\s\S]*?await clear\(\);/u,
  );
});

test("VFX-001A: il cleanup degli item già creati non appartiene al bucket cancellabile del lifecycle", () => {
  const block = functionBlock("scheduleIndependent");
  assert.match(block, /return schedule\(callback, delay\);/u);
  assert.doesNotMatch(block, /lifecycleId/u);
});

test("VFX-001A: gli end visual e tutti i cleanup one-shot usano timer indipendenti", () => {
  const renderEvent = functionBlock("renderEvent");
  assert.match(
    renderEvent,
    /event\.mode === "end"[\s\S]*?scheduleIndependent\(\(\) => renderLayer\(event, layer\), layer\.delay\)/u,
  );

  const renderLayer = source.slice(
    source.indexOf("async function renderLayer("),
    source.indexOf("async function renderEvent("),
  );
  assert.match(
    renderLayer,
    /const cleanupDelay =[\s\S]*?const effectiveDelay =[\s\S]*?transientVisualExpiries\.set\(item\.id,[\s\S]*?scheduleIndependent\(\(\) => deleteLocalItem\(item\.id\), effectiveDelay\)/u,
  );
});

test("VFX-001A: gli start/delayed non terminali restano cancellabili dal lifecycle", () => {
  const renderEvent = functionBlock("renderEvent");
  assert.match(
    renderEvent,
    /schedule\(\(\) => renderLayer\(event, layer\), layer\.delay, lifecycleId\)/u,
  );
  assert.match(source, /clearLifecycleTimers\(lifecycleId\);/u);
});

test("VFX-001A.1: i transient vengono eliminati prima del loop boundary e hanno recovery sweep", () => {
  assert.match(source, /const TRANSIENT_CLEANUP_MARGIN_MS = 120/u);
  assert.match(source, /const TRANSIENT_SWEEP_INTERVAL_MS = 1000/u);
  assert.match(source, /const transientVisualExpiries = new Map\(\)/u);
  const renderLayer = source.slice(
    source.indexOf("async function renderLayer("),
    source.indexOf("async function renderEvent("),
  );
  assert.match(renderLayer, /cleanupDelay - Math\.min\([\s\S]*?TRANSIENT_CLEANUP_MARGIN_MS/u);
  assert.match(source, /async function sweepExpiredTransientVisuals\(\)[\s\S]*?deleteLocalItem\(itemId\)/u);
  assert.match(source, /startTransientVisualSweeper\(\)/u);
  assert.match(source, /stopTransientVisualSweeper\(\)/u);
});

test("VFX-001A.1: un delete locale fallito resta recuperabile", () => {
  const block = source.slice(
    source.indexOf("async function deleteLocalItem("),
    source.indexOf("async function sweepExpiredTransientVisuals("),
  );
  assert.match(block, /await OBR\.scene\.local\.deleteItems\(\[normalized\]\)/u);
  assert.match(block, /return false/u);
  assert.match(block, /transientVisualExpiries\.delete\(normalized\)/u);
});

test("VFX-001A.2: i layer one-shot non dipendono dal lifecycle timer", () => {
  const renderEvent = functionBlock("renderEvent");
  assert.match(
    renderEvent,
    /event\.mode === "end" \|\| layer\.oneShot === true[\s\S]*?scheduleIndependent\(\(\) => renderLayer\(event, layer\), layer\.delay\)/u,
  );

  const renderLayer = source.slice(
    source.indexOf("async function renderLayer("),
    source.indexOf("async function renderEvent("),
  );
  assert.match(renderLayer, /const isOneShot = layer\.oneShot === true/u);
  assert.match(renderLayer, /!isOneShot[\s\S]*?lifecycleTargetEnded/u);
  assert.match(source, /oneShot: layer\.oneShot === true/u);
});
