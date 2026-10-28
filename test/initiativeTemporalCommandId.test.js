import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createEffectsMutationBackgroundBroker } from "../src/effectsMutationBroker.js";
import { createInitiativeTemporalLane } from "../src/initiativeTemporalLaneCore.js";

// Lot L2 of the bugfix pass (EF-01): a tracker opened again (from the icon, or switching the layout) counts its
// transitions from 0 while the background keeps the previous page's command ids for the same scene. With the same id
// and another payload the broker answered "command-id-payload-conflict", and the temporal lane stayed blocked until
// the scene changed: no turn or round expiry any more.
const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
const runtimeStart = source.indexOf("const __temporalRuntimeId =");
const runtimeEnd = source.indexOf(";", runtimeStart) + 1;
const functionStart = source.indexOf("function __temporalCommandId(descriptor, mutationType) {");
const functionEnd = source.indexOf("async function __applyInitiativeTemporalDescriptor(", functionStart);

// One tracker page: its module state, evaluated again as a page load does.
function loadTrackerPageCommandId() {
  return new Function(`${source.slice(runtimeStart, runtimeEnd)}
${source.slice(functionStart, functionEnd)}
return __temporalCommandId;`)();
}

test("L2: two tracker pages on the same scene give the same transition different command ids", () => {
  assert.ok(runtimeStart > 0 && functionStart > 0, "the page id and the command id are in initiativeList.js");
  const descriptor = { sceneIdentity: "scene-S", sceneEpoch: 1, transitionSeq: 2 };
  const firstPage = loadTrackerPageCommandId();
  const secondPage = loadTrackerPageCommandId();
  assert.equal(firstPage(descriptor, "effects:tick-boundaries"), firstPage(descriptor, "effects:tick-boundaries"),
    "a retry of the same transition keeps its id");
  assert.notEqual(firstPage(descriptor, "effects:tick-boundaries"), secondPage(descriptor, "effects:tick-boundaries"));
  assert.notEqual(firstPage(descriptor, "effects:tick-round"), firstPage(descriptor, "effects:tick-boundaries"));
});

test("L2: after the tracker is opened again, the background applies the new page's turn boundaries", async () => {
  let executed = 0;
  const broker = createEffectsMutationBackgroundBroker({
    executeApply: async (_operations, command) => {
      executed += 1;
      return { status: "applied", commandId: command.commandId, committed: true, changedIds: [], changes: [] };
    },
    executeUndo: async () => ({ status: "applied" }),
  });
  broker.setSceneIdentity("scene-S");

  // The page's lane applies a descriptor as __applyInitiativeTemporalDescriptor does: a refused command throws.
  function trackerPage() {
    const commandIdOf = loadTrackerPageCommandId();
    let seq = 0;
    const lane = createInitiativeTemporalLane({
      apply: async (descriptor) => {
        const commandId = commandIdOf(descriptor, descriptor.mutationType);
        const { result } = await broker.handle({
          kind: "apply",
          requestId: `request-${commandId}`,
          command: {
            commandId,
            sceneIdentity: "scene-S",
            kind: descriptor.mutationType,
            operations: [{ type: descriptor.mutationType, boundaries: descriptor.boundaries, createdAt: descriptor.createdAt }],
          },
        });
        if (result?.status !== "applied") throw new Error(`Effects mutation ${result?.status}: ${result?.reason}.`);
        return result;
      },
    });
    return (createdAt, ending, starting) => lane.enqueue({
      sceneEpoch: 1,
      sceneIdentity: "scene-S",
      transitionSeq: ++seq,
      mutationType: "effects:tick-boundaries",
      createdAt,
      boundaries: [{ phase: "end", actorId: ending }, { phase: "start", actorId: starting }],
    });
  }

  const firstPage = trackerPage();
  assert.equal((await firstPage(1000, "A", "B")).status, "applied");
  assert.equal((await firstPage(2000, "B", "C")).status, "applied");
  const secondPage = trackerPage();
  for (const [createdAt, ending, starting] of [[3000, "C", "A"], [4000, "A", "B"], [5000, "B", "C"]]) {
    assert.equal((await secondPage(createdAt, ending, starting)).status, "applied", `${ending} -> ${starting}`);
  }
  assert.equal(executed, 5);
});
