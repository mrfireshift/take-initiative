import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDirectQuickActionConditionRequest,
} from "../src/quickActionConditionExecutionCore.js";

function conditionAction(overrides = {}) {
  return {
    id: "quick-vow",
    label: "Giuramento",
    kind: "condition",
    conditionName: "Giuramento di Inimicizia",
    targetMode: "selection",
    expiryMode: "turn-end",
    duration: 2,
    ...overrides,
  };
}

test("prepara una condizione diretta per un singolo bersaglio selezionato", () => {
  const decision = buildDirectQuickActionConditionRequest({
    action: conditionAction(),
    sourceId: "paladin",
    selectedTargetIds: ["enemy"],
  });

  assert.deepEqual(decision, {
    mode: "direct",
    kind: "condition",
    request: {
      conditionName: "Giuramento di Inimicizia",
      targetIds: ["enemy"],
      conditionMode: "add",
      sourceId: "paladin",
      expiry: {
        mode: "turn-end",
        remaining: 2,
        actor: "target",
      },
    },
  });
});

test("una condizione personale usa il personaggio come bersaglio", () => {
  const decision = buildDirectQuickActionConditionRequest({
    action: conditionAction({
      targetMode: "self",
      expiryMode: "manual",
      duration: null,
    }),
    sourceId: "paladin",
  });

  assert.equal(decision.mode, "direct");
  assert.deepEqual(decision.request.targetIds, ["paladin"]);
  assert.deepEqual(decision.request.expiry, { mode: "manual" });
});

test("una selezione multipla resta nel pannello di revisione", () => {
  assert.deepEqual(buildDirectQuickActionConditionRequest({
    action: conditionAction(),
    sourceId: "paladin",
    selectedTargetIds: ["enemy-1", "enemy-2"],
  }), {
    mode: "review",
    reason: "single-target-required",
  });
});
