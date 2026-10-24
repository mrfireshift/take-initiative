import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const initiativeSource = readFileSync(
  new URL("../src/initiativeList.js", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

function createTemporalIdentity({ isGm }) {
  const start = initiativeSource.indexOf("function __ensureInitiativeTemporalSceneIdentity");
  const end = initiativeSource.indexOf("function __temporalCommandId", start);
  assert.ok(start >= 0 && end > start);
  const requests = [];
  const factory = new Function(
    "IS_GM",
    "getEffectsMutationSceneContext",
    "currentSceneEpoch",
    "isCurrentSceneEpoch",
    `let __temporalSceneIdentity = "";
    let __temporalSceneIdentityPromise = null;
    let __temporalLaneGeneration = 1;
    ${initiativeSource.slice(start, end)}
    return {
      ensure: __ensureInitiativeTemporalSceneIdentity,
      identity: () => __temporalSceneIdentity,
    };`,
  );
  const runtime = factory(
    isGm,
    async ({ commandId }) => {
      requests.push(commandId);
      return { sceneIdentity: "scene-a" };
    },
    () => 5,
    (epoch) => epoch === 5,
  );
  return { ...runtime, requests };
}

test("tracker Player: nessuna richiesta dell'identità di scena per i turni", async () => {
  const runtime = createTemporalIdentity({ isGm: false });
  assert.equal(await runtime.ensure(5), "");
  assert.deepEqual(runtime.requests, []);
  assert.equal(runtime.identity(), "");
});

test("tracker GM: identità di scena richiesta una volta e poi riusata", async () => {
  const runtime = createTemporalIdentity({ isGm: true });
  assert.equal(await runtime.ensure(5), "scene-a");
  assert.equal(await runtime.ensure(5), "scene-a");
  assert.equal(runtime.requests.length, 1);
  assert.match(runtime.requests[0], /^initiative-temporal-context:5:1$/u);
});
