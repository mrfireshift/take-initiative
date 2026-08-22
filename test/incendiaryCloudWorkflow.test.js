import assert from "node:assert/strict";
import test from "node:test";

import { AOE_AREA_META_KEY } from "../src/aoeStyle.js";
import { ID } from "../src/constants.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import {
  buildSpellUnifiedPanelContract,
} from "../src/spellUnifiedPanelCore.js";
import { spellTurnPromptRequests } from "../src/callLightningTurnPromptCore.js";
import {
  getSpellAreaRuleById,
} from "../src/spellAreaRules.js";
import {
  planSpellZoneTriggers,
} from "../src/spellZoneTriggerCore.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
function cloudRule() {
  return getSpellAreaRuleById("incendiary-cloud:cast");
}

function cloudZone(overrides = {}) {
  const rule = cloudRule();
  return {
    id: "cloud-root",
    position: { x: 0, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "root",
        instanceId: "cloud-instance",
        ruleId: rule.id,
        spellId: rule.spellId,
        casterId: "caster",
        ...(overrides.staticZone || {}),
      },
      [AOE_AREA_META_KEY]: {
        type: "circle",
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        dpi: 50,
        gridOrigin: { x: 0, y: 0 },
        basePosition: { x: 0, y: 0 },
      },
    },
    ...overrides,
  };
}

function cloudPromptItems() {
  return [
    {
      id: "caster",
      name: "Caster",
      metadata: {
        [META_KEY]: {
          [SPELLS_KEY]: [{
            name: "Nube incendiaria",
            spellId: "incendiary-cloud",
            instanceId: "cloud-instance",
            casterId: "caster",
            appliedAt: { turnKey: "1:0:other" },
            castContext: {
              staticZoneOwner: true,
              slotLevel: 8,
            },
          }],
        },
      },
    },
    cloudZone(),
  ];
}

test("Nube Incendiaria richiede placement e mantiene il movimento manuale", () => {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "incendiary-cloud",
    castContext: { slotLevel: 8 },
  });
  assert.equal(contract.presentation.placement.required, true);
  assert.equal(contract.presentation.placement.policy, "required");

  const input = {
    contract,
    spellId: "incendiary-cloud",
    casterId: "caster",
    slotLevel: 8,
    targetIds: ["target"],
    outcomes: { target: "failed" },
    hpAmount: 20,
  };
  const missingPlacement = buildSpellAreaResolutionCommand(input);
  assert.equal(missingPlacement.valid, false);
  assert.ok(missingPlacement.errors.includes("placement-required"));

  const placed = buildSpellAreaResolutionCommand({
    ...input,
    placement: {
      status: "confirmed",
      ruleId: "incendiary-cloud:cast",
      spellId: "incendiary-cloud",
      casterId: "caster",
      targetIds: ["target"],
      preview: { position: { x: 0, y: 0 } },
    },
  });
  assert.equal(placed.valid, true);

  const rule = cloudRule();
  assert.equal(rule.zonePolicy.initialResolution, "manual-save");
  assert.deepEqual(
    rule.zonePolicy.triggers
      .filter((trigger) => ["enter", "turn-end"].includes(trigger.event))
      .map((trigger) => ({
        event: trigger.event,
        dice: trigger.damage.dice,
        onSave: trigger.damage.onSave,
        ability: trigger.ability,
        hasScaling: Object.hasOwn(trigger.damage, "baseSlot")
          || Object.hasOwn(trigger.damage, "additionalPerSlotAbove"),
      })),
    [
      { event: "enter", dice: "10d8", onSave: "half", ability: "dex", hasScaling: false },
      { event: "turn-end", dice: "10d8", onSave: "half", ability: "dex", hasScaling: false },
    ],
  );
  assert.equal(rule.zonePolicy.movement, "manual");
});

test("Nube Incendiaria non espone un prompt automatico di movimento", () => {
  const request = spellTurnPromptRequests({
    items: cloudPromptItems(),
    actorId: "caster",
    sceneEpoch: 4,
    turnKey: "2:0:caster",
  });
  assert.deepEqual(request, []);
});

test("il movimento della nube non crea entry, mentre il movimento del target sì", () => {
  const rule = cloudRule();
  const entryTrigger = rule.zonePolicy.triggers.find((trigger) => trigger.event === "enter");
  const metadata = {
    instanceId: "cloud-instance",
    ruleId: rule.id,
    spellId: rule.spellId,
    casterId: "caster",
  };

  const cloudPassesOverTarget = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: {
      initialized: true,
      memberIds: [],
      evaluatedTurnKey: "1:0:other",
      areaPosition: { x: 0, y: 0 },
    },
    currentTargetIds: ["target"],
    currentTargetPositions: { target: { x: 100, y: 0 } },
    areaPosition: { x: 100, y: 0 },
    initiativeState: { order: ["target"], current: 0, round: 2 },
  });
  assert.equal(cloudPassesOverTarget.newActivations.some(
    (activation) => activation.triggerId === entryTrigger.id,
  ), false);

  const targetEnters = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: {
      initialized: true,
      memberIds: [],
      evaluatedTurnKey: "2:0:other",
      areaPosition: { x: 100, y: 0 },
    },
    currentTargetIds: ["target"],
    currentTargetPositions: { target: { x: 100, y: 0 } },
    areaPosition: { x: 100, y: 0 },
    initiativeState: { order: ["target"], current: 0, round: 2 },
  });
  assert.equal(targetEnters.newActivations.some(
    (activation) => activation.triggerId === entryTrigger.id,
  ), true);
});
