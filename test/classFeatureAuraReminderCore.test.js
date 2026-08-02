import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import { CLASS_FEATURE_AURA_META_KEY } from "../src/classFeatureAuraCore.js";
import { CLASS_FEATURE_CATALOG } from "../src/classFeatureCatalog.js";
import { planClassFeatureAuraReminder } from "../src/classFeatureAuraReminderCore.js";

const META_KEY = `${ID}/meta`;
const feature = CLASS_FEATURE_CATALOG.features.find(
  (entry) => entry.id === "paladino-giuramento-di-vendetta-angelo-vendicatore",
);
const aura = {
  instanceId: "angel-1",
  featureId: feature.id,
  sourceId: "paladin",
  conditionName: feature.effectPlan.conditionName,
  triggerPolicy: feature.effectPlan.triggerPolicy,
};
const itemsById = new Map([
  ["paladin", {
    id: "paladin",
    name: "Paladino",
    metadata: { [META_KEY]: { initiativeCard: { spellSaveDC: 18 } } },
  }],
  ["enemy", {
    id: "enemy",
    name: "Nemico",
    metadata: { [META_KEY]: {} },
  }],
]);
const state = (current, round = 1) => ({
  order: ["paladin", "enemy"],
  current,
  round,
});

test("Angelo Vendicatore ricorda il primo ingresso del nemico con un popup", () => {
  const initialized = planClassFeatureAuraReminder({
    aura,
    desiredTargetIds: [],
    initiativeState: state(0),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 1,
  });
  const auraItem = {
    id: "angel-aura",
    metadata: {
      [CLASS_FEATURE_AURA_META_KEY]: {
        instanceId: aura.instanceId,
        triggerRuntime: initialized.runtime,
      },
    },
  };
  const entered = planClassFeatureAuraReminder({
    aura,
    auraItem,
    desiredTargetIds: ["enemy"],
    initiativeState: state(0),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 2,
  });

  assert.equal(entered.newActivations.length, 1);
  assert.equal(entered.newActivations[0].event, "enter");
  assert.equal(entered.notices[0].spellName, "Angelo Vendicatore");
  assert.equal(entered.notices[0].label, "TS Saggezza da risolvere");
  assert.equal(entered.notices[0].dc, 18);
  assert.match(entered.notices[0].failureEffect, /Spaventato/);
});

test("Angelo Vendicatore usa lo stesso gruppo once tra ingresso e inizio turno", () => {
  const initialized = planClassFeatureAuraReminder({
    aura,
    desiredTargetIds: ["enemy"],
    initiativeState: state(0),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 1,
  });
  const auraItem = {
    id: "angel-aura",
    metadata: {
      [CLASS_FEATURE_AURA_META_KEY]: {
        instanceId: aura.instanceId,
        triggerRuntime: initialized.runtime,
      },
    },
  };
  const turnStart = planClassFeatureAuraReminder({
    aura,
    auraItem,
    desiredTargetIds: ["enemy"],
    initiativeState: state(1),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 2,
  });
  const afterEntry = planClassFeatureAuraReminder({
    aura,
    auraItem: {
      ...auraItem,
      metadata: {
        [CLASS_FEATURE_AURA_META_KEY]: {
          ...auraItem.metadata[CLASS_FEATURE_AURA_META_KEY],
          triggerRuntime: turnStart.runtime,
        },
      },
    },
    desiredTargetIds: ["enemy"],
    initiativeState: state(1, 2),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 3,
  });

  assert.equal(turnStart.newActivations.length, 1);
  assert.equal(turnStart.newActivations[0].event, "turn-start");
  assert.deepEqual(afterEntry.newActivations, []);
});
