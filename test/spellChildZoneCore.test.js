import test from "node:test";
import assert from "node:assert/strict";
import {
  childZoneActivationKey,
  childZoneItemsForParent,
  isSpellChildZoneMetadata,
  spellChildZoneMetadata,
  uniqueChildZoneTargetIds,
  validateChildZoneContainment,
} from "../src/spellChildZoneCore.js";
import { ID } from "../src/constants.js";

const zoneMetaKey = `${ID}/spellStaticZone`;

test("il contratto figlio conserva root, istanza, variante e attivazione", () => {
  const metadata = spellChildZoneMetadata({
    parentZoneId: "root-1",
    parentInstanceId: "spell-1",
    casterId: "caster-1",
    spellId: "earthquake",
    childKind: "fissure",
    childIndex: 2,
    activationId: "activation-1",
    sceneEpoch: 7,
    variant: "fissure",
    geometry: { type: "rectangle", widthMeters: 3 },
    style: { fillColor: "#663" },
    triggers: [{ id: "trigger-1" }],
  });

  assert.equal(metadata.role, "subzone");
  assert.equal(metadata.parentZoneId, "root-1");
  assert.equal(metadata.parentInstanceId, "spell-1");
  assert.equal(metadata.instanceId, "spell-1");
  assert.equal(metadata.ruleChoice, "fissure");
  assert.equal(isSpellChildZoneMetadata(metadata), true);
  assert.equal(childZoneActivationKey(metadata), "spell-1:fissure:activation-1");
});

test("i figli appartengono alla root corretta e non diventano nuove root", () => {
  const child = spellChildZoneMetadata({
    parentZoneId: "root-1",
    parentInstanceId: "spell-1",
    casterId: "caster-1",
    spellId: "control-water",
    childKind: "whirlpool",
    activationId: "activation-1",
  });
  const items = [
    { id: "root-1", metadata: { [zoneMetaKey]: { role: "root", instanceId: "spell-1" } } },
    { id: "child-1", metadata: { [zoneMetaKey]: child } },
    { id: "child-2", metadata: { [zoneMetaKey]: { ...child, parentZoneId: "root-2" } } },
  ];

  assert.deepEqual(
    childZoneItemsForParent(items, { parentZoneId: "root-1", parentInstanceId: "spell-1" })
      .map((item) => item.id),
    ["child-1"],
  );
  assert.equal(items[0].metadata[zoneMetaKey].role, "root");
});

test("il containment rifiuta un vortice esterno e accetta una fessura che attraversa la root", () => {
  const parent = { type: "circle", origin: { x: 0, y: 0 }, radius: 30 };
  assert.equal(
    validateChildZoneContainment({
      parentArea: parent,
      childArea: { type: "circle", origin: { x: 10, y: 0 }, radius: 5 },
      childKind: "whirlpool",
    }),
    true,
  );
  assert.equal(
    validateChildZoneContainment({
      parentArea: parent,
      childArea: { type: "circle", origin: { x: 28, y: 0 }, radius: 5 },
      childKind: "whirlpool",
    }),
    false,
  );
  assert.equal(
    validateChildZoneContainment({
      parentArea: parent,
      childArea: {
        type: "rectangle",
        origin: { x: -30, y: 0 },
        points: [
          { x: -30, y: -1 },
          { x: 30, y: -1 },
          { x: 30, y: 1 },
          { x: -30, y: 1 },
        ],
        cells: [{ x: -1, y: -1, width: 2, height: 2 }],
      },
      childKind: "fissure",
    }),
    true,
  );
  assert.equal(
    validateChildZoneContainment({
      parentArea: parent,
      childArea: {
        type: "rectangle",
        centerlineStart: { x: -30, y: 0 },
        centerlineEnd: { x: 0, y: 30 },
        points: [
          { x: -30, y: -1 },
          { x: 0, y: 30 },
          { x: 1, y: 29 },
          { x: -29, y: -1 },
        ],
        cells: [{ x: -1, y: -1, width: 2, height: 2 }],
      },
      childKind: "fissure",
    }),
    true,
  );
});

test("i bersagli di una stessa attivazione vengono deduplicati", () => {
  assert.deepEqual(
    uniqueChildZoneTargetIds(["target-1", "target-1", "", null, "target-2"]),
    ["target-1", "target-2"],
  );
});
