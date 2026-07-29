import test from "node:test";
import assert from "node:assert/strict";

import {
  collectActiveMobileAuras,
  mobileAuraMembershipPlan,
  mobileAuraTargetIds,
  staleMobileAuraEffectRemovals,
} from "../src/spellAuraCore.js";

const META = "meta";
const SPELLS = "spells";
const bounds = (x, y, size = 100) => ({
  min: { x, y },
  max: { x: x + size, y: y + size },
});
const token = (id, {
  spells = [],
  conditions = [],
  attitude = "neutral",
} = {}) => ({
  id,
  metadata: {
    [META]: {
      [SPELLS]: spells,
      attitude,
      ...(conditions.length ? { conditions: { version: 2, instances: conditions } } : {}),
    },
  },
});

test("rileva soltanto le aure mobili abilitate nel contesto di lancio", () => {
  const items = [
    token("caster", {
      spells: [{
        spellId: "xanathar-investitura-del-ghiaccio",
        instanceId: "spell-1",
        casterId: "caster",
        castContext: { mobileAura: true },
      }, {
        spellId: "xanathar-investitura-del-ghiaccio",
        instanceId: "spell-2",
        casterId: "caster",
        castContext: { mobileAura: false },
      }],
    }),
  ];
  const auras = collectActiveMobileAuras(items, { metaKey: META, spellsKey: SPELLS });
  assert.equal(auras.length, 1);
  assert.equal(auras[0].instanceId, "spell-1");
  assert.equal(auras[0].rule.kind, "aura");
});

test("calcola i bersagli nell'area escludendo il caster", () => {
  const caster = token("caster");
  const inside = token("inside");
  const outside = token("outside");
  const [aura] = collectActiveMobileAuras([
    {
      ...caster,
      metadata: {
        [META]: {
          [SPELLS]: [{
            spellId: "xanathar-investitura-del-ghiaccio",
            instanceId: "spell-1",
            casterId: "caster",
            castContext: { mobileAura: true },
          }],
        },
      },
    },
  ], { metaKey: META, spellsKey: SPELLS });
  const area = { cells: [{ x: 0, y: 0, width: 300, height: 300 }] };
  assert.deepEqual(mobileAuraTargetIds({
    aura,
    area,
    metaKey: META,
    candidates: [
      { item: caster, bounds: bounds(100, 100) },
      { item: inside, bounds: bounds(250, 100) },
      { item: outside, bounds: bounds(400, 100) },
    ],
  }), ["inside"]);
});

test("entrata e uscita producono mutazioni limitate alla singola istanza", () => {
  const [aura] = collectActiveMobileAuras([
    token("caster", {
      spells: [{
        spellId: "xanathar-investitura-del-ghiaccio",
        instanceId: "spell-1",
        casterId: "caster",
        castContext: { mobileAura: true },
      }],
    }),
  ], { metaKey: META, spellsKey: SPELLS });
  const items = [
    token("old-target", {
      conditions: [{
        id: "condition-old",
        condition: "Terreno difficile / aura ghiacciata",
        parentEffectId: "spell-1",
        effectId: "ice-investiture-difficult-terrain",
      }],
    }),
    token("other-aura", {
      conditions: [{
        id: "condition-other",
        condition: "Terreno difficile / aura ghiacciata",
        parentEffectId: "spell-2",
        effectId: "ice-investiture-difficult-terrain",
      }],
    }),
  ];
  const plan = mobileAuraMembershipPlan({
    aura,
    desiredTargetIds: ["new-target"],
    items,
    metaKey: META,
    sourceName: "Omar",
  });
  assert.deepEqual(plan.entering, ["new-target"]);
  assert.deepEqual(plan.leaving, ["old-target"]);
  assert.deepEqual(plan.operations[0].removals, [{
    itemId: "old-target",
    instanceId: "condition-old",
  }]);
  assert.equal(plan.operations[1].options.parentEffectId, "spell-1");
  assert.equal(plan.operations[1].options.mechanics.movement.costMultiplier, 2);
});

test("ripulisce soltanto gli effetti appartenenti ad aure non più attive", () => {
  const items = [
    token("active", { conditions: [{
      id: "active-condition",
      parentEffectId: "spell-active",
      effectId: "ice-investiture-difficult-terrain",
    }] }),
    token("stale", { conditions: [{
      id: "stale-condition",
      parentEffectId: "spell-ended",
      effectId: "ice-investiture-difficult-terrain",
    }] }),
  ];
  assert.deepEqual(staleMobileAuraEffectRemovals(items, {
    activeInstanceIds: ["spell-active"],
    auraEffectIds: ["ice-investiture-difficult-terrain"],
    metaKey: META,
  }), [{ itemId: "stale", instanceId: "stale-condition" }]);
});
