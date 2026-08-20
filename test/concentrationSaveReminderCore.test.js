import test from "node:test";
import assert from "node:assert/strict";
import { ID } from "../src/constants.js";
import { buildConcentrationSaveWarning } from "../src/concentrationSaveReminderCore.js";
import { buildReminderResolutionPlan } from "../src/reminderResolutionCore.js";

const META_KEY = `${ID}/meta`;
const CONCENTRATION_KEY = `${ID}/concentration`;

function caster(concentration) {
  return {
    id: "caster-1",
    name: "Lavera",
    metadata: {
      [META_KEY]: {
        [CONCENTRATION_KEY]: concentration,
      },
    },
  };
}

test("il warning concentrazione produce un reminder con riferimento stabile", () => {
  const warning = buildConcentrationSaveWarning({
    casterId: "caster-1",
    casterName: "Lavera",
    concentration: {
      ragnatela: { instanceId: "spell-1", name: "Ragnatela" },
    },
    damage: 20,
    dc: 10,
    eventId: "damage-1",
  });

  assert.equal(warning.notice.activationId, "concentration-save:damage-1:caster-1");
  assert.equal(warning.spellName, "Ragnatela");
  assert.deepEqual(
    warning.notice.resolution.outcomes.failed.actions,
    [{
      kind: "concentration",
      action: "break",
      targetId: "caster-1",
      casterId: "caster-1",
      reference: "spell-1",
    }],
  );
});


test("il warning conserva la History entry che ha causato il danno", () => {
  const warning = buildConcentrationSaveWarning({
    casterId: "caster-1",
    casterName: "Lavera",
    concentration: {
      ragnatela: { instanceId: "spell-1", name: "Ragnatela" },
    },
    damage: 12,
    dc: 10,
    eventId: "damage-causal",
    causeHistoryEntryId: "history-damage-1",
  });

  assert.equal(warning.notice.causeHistoryEntryId, "history-damage-1");
});

test("Superato conserva la spell e Fallito interrompe la concentrazione corrente", () => {
  const concentration = {
    ragnatela: { instanceId: "spell-1", name: "Ragnatela" },
  };
  const warning = buildConcentrationSaveWarning({
    casterId: "caster-1",
    casterName: "Lavera",
    concentration,
    damage: 20,
    dc: 10,
    eventId: "damage-2",
  });
  const item = caster(concentration);

  const passed = buildReminderResolutionPlan({
    notice: warning.notice,
    items: [item],
    outcome: "passed",
  });
  assert.equal(passed.status, "ready");
  assert.deepEqual(passed.operations, []);

  const failed = buildReminderResolutionPlan({
    notice: warning.notice,
    items: [item],
    outcome: "failed",
  });
  assert.equal(failed.status, "ready");
  assert.deepEqual(failed.operations, [{
    type: "concentration:break",
    casterIds: ["caster-1"],
    reference: "spell-1",
  }]);
  assert.deepEqual(failed.sideEffects, [{
    type: "static-zone:remove-ended",
    selectors: [{ instanceId: "spell-1" }],
  }]);
});

test("Fallito non interrompe una concentrazione sostituita dopo il danno", () => {
  const warning = buildConcentrationSaveWarning({
    casterId: "caster-1",
    concentration: {
      ragnatela: { instanceId: "spell-1", name: "Ragnatela" },
    },
    damage: 20,
    dc: 10,
    eventId: "damage-3",
  });
  const changedCaster = caster({
    volare: { instanceId: "spell-2", name: "Volare" },
  });

  const failed = buildReminderResolutionPlan({
    notice: warning.notice,
    items: [changedCaster],
    outcome: "failed",
  });
  assert.equal(failed.status, "stale");
  assert.deepEqual(failed.operations, undefined);
});
