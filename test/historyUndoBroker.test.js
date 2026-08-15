import test from "node:test";
import assert from "node:assert/strict";
import { createEffectsMutationBackgroundBroker } from "../src/effectsMutationBroker.js";

test("un command ID Undo riusato con payload differente produce conflict", async () => {
  let executions = 0;
  const broker = createEffectsMutationBackgroundBroker({
    executeApply: async () => ({ status: "applied" }),
    executeUndo: async () => {
      executions += 1;
      return { status: "applied", changedIds: ["token-1"] };
    },
  });
  broker.setSceneIdentity("scene-a");
  const first = await broker.handle({
    requestId: "request-1",
    kind: "undo",
    options: { commandId: "undo-1", sceneIdentity: "scene-a" },
    entry: { id: "entry-a" },
  });
  const duplicate = await broker.handle({
    requestId: "request-2",
    kind: "undo",
    options: { commandId: "undo-1", sceneIdentity: "scene-a" },
    entry: { id: "entry-a" },
  });
  const conflict = await broker.handle({
    requestId: "request-3",
    kind: "undo",
    options: { commandId: "undo-1", sceneIdentity: "scene-a" },
    entry: { id: "entry-b" },
  });
  assert.equal(first.result.status, "applied");
  assert.equal(duplicate.duplicate, true);
  assert.equal(conflict.result.status, "conflict");
  assert.equal(conflict.result.reason, "command-id-payload-conflict");
  assert.equal(executions, 1);
});

test("il cambio scene identity azzera la cache Undo", async () => {
  let executions = 0;
  const broker = createEffectsMutationBackgroundBroker({
    executeApply: async () => ({ status: "applied" }),
    executeUndo: async () => {
      executions += 1;
      return { status: "applied" };
    },
  });
  broker.setSceneIdentity("scene-a");
  await broker.handle({
    requestId: "request-1",
    kind: "undo",
    options: { commandId: "undo-1", sceneIdentity: "scene-a" },
    entry: { id: "entry-a" },
  });
  broker.setSceneIdentity("scene-b");
  const result = await broker.handle({
    requestId: "request-2",
    kind: "undo",
    options: { commandId: "undo-1", sceneIdentity: "scene-b" },
    entry: { id: "entry-a" },
  });
  assert.equal(result.duplicate, false);
  assert.equal(result.result.status, "applied");
  assert.equal(executions, 2);
});

test("un fallimento pre-commit escluso dalla cache consente il retry dello stesso Undo", async () => {
  let executions = 0;
  const broker = createEffectsMutationBackgroundBroker({
    executeApply: async () => ({ status: "applied" }),
    executeUndo: async () => {
      executions += 1;
      return executions === 1
        ? { status: "failed", committed: false, reason: "transient-pre-commit" }
        : { status: "applied", committed: true };
    },
    shouldCacheResult: (result) => result?.reason !== "transient-pre-commit",
  });
  broker.setSceneIdentity("scene-a");
  const message = {
    requestId: "request-1",
    kind: "undo",
    options: { commandId: "undo-retry", sceneIdentity: "scene-a" },
    entry: { id: "entry-a" },
  };

  const first = await broker.handle(message);
  const retried = await broker.handle({ ...message, requestId: "request-2" });
  const duplicate = await broker.handle({ ...message, requestId: "request-3" });

  assert.equal(first.result.status, "failed");
  assert.equal(retried.duplicate, false);
  assert.equal(retried.result.status, "applied");
  assert.equal(duplicate.duplicate, true);
  assert.equal(executions, 2);
});
