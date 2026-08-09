import test from "node:test";
import assert from "node:assert/strict";

import {
  chainLightningSecondaryMaximum,
  resolveChainLightningTargeting,
} from "../src/chainLightningTargetingCore.js";

test("Catena di fulmini aumenta i secondari in base al livello dello slot", () => {
  assert.equal(chainLightningSecondaryMaximum(6), 3);
  assert.equal(chainLightningSecondaryMaximum(7), 4);
  assert.equal(chainLightningSecondaryMaximum(9), 6);
});

test("il contratto accetta primario e secondari distinti entro le distanze RAW", () => {
  const result = resolveChainLightningTargeting({
    slotLevel: 7,
    primaryId: "primary",
    secondaryIds: ["secondary-1", "secondary-2", "secondary-3", "secondary-4"],
    primaryDistanceMeters: 44,
    secondaryDistancesMeters: {
      "secondary-1": 9,
      "secondary-2": 8.5,
      "secondary-3": 4,
      "secondary-4": 0,
    },
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.targetIds, [
    "primary",
    "secondary-1",
    "secondary-2",
    "secondary-3",
    "secondary-4",
  ]);
  assert.equal(result.maximumSecondaryTargets, 4);
});

test("il contratto rifiuta duplicati, limiti e distanze fuori gittata", () => {
  const result = resolveChainLightningTargeting({
    primaryId: "primary",
    secondaryIds: ["secondary-1", "secondary-1", "primary", "secondary-2", "secondary-3"],
    primaryDistanceMeters: 46,
    secondaryDistancesMeters: {
      "secondary-1": 10,
      "secondary-2": 8,
      "secondary-3": 7,
    },
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("duplicate-targets"));
  assert.ok(result.errors.includes("secondary-limit-exceeded"));
  assert.ok(result.errors.includes("primary-out-of-range"));
  assert.ok(result.errors.includes("secondary-out-of-range"));
  assert.deepEqual(result.duplicateTargetIds, ["secondary-1", "primary"]);
});

test("il livello dello slot resta vincolato all'intervallo dell'incantesimo", () => {
  const result = resolveChainLightningTargeting({
    slotLevel: 5,
    primaryId: "primary",
    validateDistances: false,
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("slot-level-invalid"));
  assert.equal(result.slotLevel, null);
});
