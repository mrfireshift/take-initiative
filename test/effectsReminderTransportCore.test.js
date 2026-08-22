import test from "node:test";
import assert from "node:assert/strict";
import { compactBackgroundReminderTransportResult } from "../src/effectsReminderTransportCore.js";

const clone = (value) => structuredClone(value);
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

function state(id, condition) {
  return {
    id,
    name: id,
    spells: [],
    concentrations: {},
    conditions: condition ? [condition] : [],
  };
}

function fullReminderResult({ spellName, activationKind, timing, condition }) {
  const states = Array.from({ length: 40 }, (_, index) => state(
    `scene-item-${index}`,
    index === 0 ? condition : {
      id: `condition-${index}`,
      condition: "Persistente",
      active: true,
      expiry: { mode: "rounds", remaining: 3 },
    },
  ));
  const change = {
    id: "scene-item-0",
    fields: { conditions: true },
    before: { conditions: [] },
    after: { conditions: [condition] },
  };
  const plan = {
    operations: [{
      type: "condition:set-instances",
      targetIds: ["scene-item-0"],
      activation: { kind: activationKind, timing },
    }],
    changes: [change],
    changedIds: ["scene-item-0"],
    states,
  };
  return {
    status: "applied",
    commandId: `reminder-resolution:${spellName}`,
    correlationId: `reminder-resolution:${spellName}`,
    kind: "reminder-resolution",
    sceneEpoch: 3,
    sceneIdentity: "scene-reminder",
    committed: true,
    operations: clone(plan.operations),
    plan,
    changes: [change],
    changedIds: ["scene-item-0"],
    historyPending: true,
    historyRecovered: false,
    historySkipped: false,
    historyError: { name: "DeferredEffectsHistory", message: "effects-history-deferred" },
    historyEntry: {
      id: `effects-history:reminder-resolution:${spellName}`,
      kind: "reminder-resolution",
      changes: [change],
    },
    postCommitErrors: [],
    sideEffectsPending: [],
    sideEffectsRecovered: false,
    commitResult: {
      committed: true,
      changedIds: ["scene-item-0"],
      sideEffectsPending: [],
      sideEffectChanges: [],
    },
  };
}

test("Cloudkill zone e Immolazione effect-save preservano il contratto con response compatta", () => {
  const cloudkill = fullReminderResult({
    spellName: "cloudkill",
    activationKind: "zone",
    timing: "turn-start",
    condition: {
      id: "cloudkill-poisoned",
      condition: "Avvelenato",
      active: true,
      expiry: { mode: "manual" },
    },
  });
  const immolation = fullReminderResult({
    spellName: "immolation-burning",
    activationKind: "effect-save",
    timing: "turn-end",
    condition: {
      id: "immolation-burning",
      condition: "In fiamme",
      active: true,
      endsParentOnRemoval: true,
      sourceId: "caster-immolation",
      saveReminder: {
        timing: "turn-end",
        ability: "dex",
        damage: { dice: "4d6", type: "fire" },
      },
    },
  });

  const compactCloudkill = compactBackgroundReminderTransportResult(cloudkill);
  const compactImmolazione = compactBackgroundReminderTransportResult(immolation);

  assert.equal(compactCloudkill.plan.changedIds[0], "scene-item-0");
  assert.equal(compactImmolazione.plan.changedIds[0], "scene-item-0");
  assert.deepEqual(compactCloudkill.plan.changes, cloudkill.plan.changes);
  assert.deepEqual(compactImmolazione.plan.changes, immolation.plan.changes);
  assert.equal(Object.prototype.hasOwnProperty.call(compactCloudkill.plan, "states"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(compactImmolazione.plan, "states"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(compactCloudkill.plan, "operations"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(compactImmolazione.plan, "operations"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(compactCloudkill, "operations"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(compactImmolazione, "operations"), false);
  assert.equal(compactCloudkill.historyEntry.id, cloudkill.historyEntry.id);
  assert.equal(compactImmolazione.historyEntry.id, immolation.historyEntry.id);
  assert.equal(compactCloudkill.commitResult.sideEffectsPending.length, 0);
  assert.equal(compactImmolazione.commitResult.sideEffectsPending.length, 0);
  assert.ok(bytes(compactCloudkill) < bytes(cloudkill));
  assert.ok(bytes(compactImmolazione) < bytes(immolation));
  assert.ok(bytes(immolation) > bytes(cloudkill));
});

test("la compattazione reminder non altera i risultati senza plan", () => {
  const result = {
    status: "failed",
    commandId: "reminder-resolution:failed",
    error: { name: "BackgroundTransportError", message: "lost" },
  };
  assert.deepEqual(compactBackgroundReminderTransportResult(result), result);
});
