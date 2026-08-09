import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  bindOptionalRuntimeOption,
  createOptionalRuntimeLifecycle,
} from "../src/options/optionalRuntimeLifecycle.js";

test("OPTIONS-004: enable, disable e riattivazione rispettano il lifecycle esplicito", async () => {
  const calls = [];
  const lifecycle = createOptionalRuntimeLifecycle({
    name: "test-runtime",
    mount: () => { calls.push("mount"); },
    unmount: () => { calls.push("unmount"); },
    cleanupOwnedOutputs: () => { calls.push("cleanup"); },
    reconcileFull: () => { calls.push("reconcile"); },
  });

  await lifecycle.setEnabled(true, { reason: "initial" });
  await lifecycle.setEnabled(false);
  await lifecycle.setEnabled(true);

  assert.deepEqual(calls, [
    "mount", "reconcile",
    "unmount", "cleanup",
    "mount", "reconcile",
  ]);
  assert.deepEqual(lifecycle.getState(), {
    name: "test-runtime", enabled: true, mounted: true, revision: 3,
  });
});

test("OPTIONS-004: runtime già off ripete cleanup owner-scoped al cambio scena", async () => {
  const calls = [];
  const lifecycle = createOptionalRuntimeLifecycle({
    cleanupOwnedOutputs: ({ reason }) => { calls.push(reason); },
  });
  await lifecycle.setEnabled(false, { reason: "initial" });
  await lifecycle.setEnabled(false, { reason: "scene-ready" });
  assert.deepEqual(calls, ["initial", "scene-ready"]);
});

test("OPTIONS-004: transizioni concorrenti sono serializzate e convergono sull'ultima", async () => {
  const calls = [];
  const lifecycle = createOptionalRuntimeLifecycle({
    mount: async () => { calls.push("mount"); await Promise.resolve(); },
    unmount: async () => { calls.push("unmount"); await Promise.resolve(); },
    cleanupOwnedOutputs: () => { calls.push("cleanup"); },
    reconcileFull: () => { calls.push("reconcile"); },
  });
  await Promise.all([
    lifecycle.setEnabled(true),
    lifecycle.setEnabled(false),
    lifecycle.setEnabled(true),
  ]);
  assert.equal(lifecycle.getState().enabled, true);
  assert.equal(lifecycle.getState().mounted, true);
  assert.deepEqual(calls, ["mount", "reconcile", "unmount", "cleanup", "mount", "reconcile"]);
});

test("OPTIONS-004: il binding usa solo selector e subscription del servizio", async () => {
  let selected = false;
  let listener = null;
  const service = {
    get(selector) { return selector({ enabled: selected }); },
    subscribe(_selector, nextListener) { listener = nextListener; return () => { listener = null; }; },
  };
  const calls = [];
  const lifecycle = createOptionalRuntimeLifecycle({
    mount: () => calls.push("mount"),
    unmount: () => calls.push("unmount"),
    cleanupOwnedOutputs: () => calls.push("cleanup"),
    reconcileFull: () => calls.push("reconcile"),
  });
  const binding = bindOptionalRuntimeOption({
    service,
    selector: (snapshot) => snapshot.enabled,
    lifecycle,
  });
  await binding.ready;
  selected = true;
  listener(true, { reason: "local-change" });
  await lifecycle.idle();
  await binding.stop();

  assert.deepEqual(calls, ["cleanup", "mount", "reconcile", "unmount", "cleanup"]);
  assert.equal(listener, null);
});

test("OPTIONS-004: i nove adapter sono selector-driven e gli ALWAYS-ON restano montati", () => {
  const background = readFileSync(new URL("../src/background.js", import.meta.url), "utf8");
  const initiative = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  const elevation = readFileSync(new URL("../src/elevationLabel.js", import.meta.url), "utf8");
  const hpBars = readFileSync(new URL("../src/hpbar-items.js", import.meta.url), "utf8");
  const combatLog = readFileSync(new URL("../src/combatLog.js", import.meta.url), "utf8");
  const tools = ["clocksTool.js", "distance3dTool.js", "referenceTool.js"]
    .map((file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"))
    .join("\n");

  assert.match(background, /selectMapEffectLabelsEnabled/);
  assert.match(background, /selectClocksToolEnabled/);
  assert.match(background, /selectDistance3dToolEnabled/);
  assert.match(background, /selectReferenceToolEnabled/);
  assert.match(background, /selectEmbersAnimationsEnabled/);
  assert.match(background, /mountEmbersVisualRenderers/);
  assert.match(background, /unmountEmbersVisualRenderers/);
  assert.match(initiative, /selectMapHpBarsEnabled/);
  assert.match(initiative, /selectActiveTurnLabelEnabled/);
  assert.match(elevation, /cleanupOwnedElevationLabels/);
  assert.match(hpBars, /cleanupOwnedHPWidgets/);
  assert.match(combatLog, /selectCombatLogEnabled/);
  assert.match(tools, /unmountClocksTool/);
  assert.match(tools, /unmountDistance3dTool/);
  assert.match(tools, /unmountReferenceTool/);

  assert.match(background, /mountEffectsMutationCoordinatorService\(\)/);
  assert.match(background, /mountSpellAuraController\(\)/);
  assert.match(background, /mountStaticSpellZoneController\(\)/);
  assert.doesNotMatch(background, /select.*History|select.*Coordinator/);
});

test("OPTIONS-004: Embers off ferma producer e ripulisce entrambi i renderer locali", () => {
  const matched = readFileSync(new URL("../src/embersMatchedVisualRenderer.js", import.meta.url), "utf8");
  const fireball = readFileSync(new URL("../src/fireballVisualRenderer.js", import.meta.url), "utf8");

  assert.match(matched, /selectEmbersAnimationsEnabled/);
  assert.match(matched, /reason:\s*"disabled"/);
  assert.match(matched, /activeLocalVideoIds/);
  assert.match(fireball, /selectEmbersAnimationsEnabled/);
  assert.match(fireball, /reason:\s*"disabled"/);
  assert.match(fireball, /activeLocalVideoIds/);
  assert.match(fireball, /activeLocalPathIds/);
});

test("OPTIONS-004: Combat Log off conserva la History e disabilita le nuove scritture dalla UI", () => {
  const combatLog = readFileSync(new URL("../src/combatLog.js", import.meta.url), "utf8");
  const historyModal = readFileSync(new URL("../src/history-modal.ts", import.meta.url), "utf8");

  assert.match(combatLog, /if \(!eventSinkEnabled\) throw new Error/);
  assert.match(combatLog, /if \(eventSinkEnabled\) \{\s+session = await ensureCombatLogSession\(/);
  assert.match(combatLog, /state\?\.sessionId \? await getStoredSession\(state\.sessionId\) : null/);
  assert.match(historyModal, /isCombatLogEventSinkEnabled/);
  assert.match(historyModal, /newSession\.disabled = true/);
  assert.match(historyModal, /note\.disabled = !combatLogEnabled/);
  assert.match(historyModal, /selectCombatLogEnabled/);
});

test("OPTIONS-004: il bootstrap del tracker non attende le letture opzioni remote", () => {
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const combatLog = readFileSync(new URL("../src/combatLog.js", import.meta.url), "utf8");
  const background = readFileSync(new URL("../src/background.js", import.meta.url), "utf8");

  assert.match(main, /void startRuntimeOptions\(\)\.catch/);
  assert.doesNotMatch(main, /await startRuntimeOptions\(\)/);
  assert.doesNotMatch(main, /await mountCombatLogEventSink\(\)/);
  assert.doesNotMatch(combatLog, /await startRuntimeOptions\(\)/);
  assert.doesNotMatch(background, /await startRuntimeOptions\(\)/);
});

test("OPTIONS-004: il lifecycle della label attiva resta nello scope del tracker", () => {
  const initiative = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  const mountStart = initiative.indexOf("export function mountInitiativeList");
  const lifecycleStart = initiative.indexOf("const __activeTurnLabelLifecycle");

  assert.ok(mountStart >= 0);
  assert.ok(lifecycleStart > mountStart);
});
