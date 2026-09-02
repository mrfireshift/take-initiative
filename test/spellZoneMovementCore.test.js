import assert from "node:assert/strict";
import test from "node:test";

import { AOE_AREA_META_KEY } from "../src/aoeStyle.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import {
  planSpellZoneMovement,
  spellZoneMovementDistanceMeters,
} from "../src/spellZoneMovementCore.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";

const scale = { parsed: { multiplier: 1.5, unit: "m" } };

function zone(ruleId, overrides = {}) {
  const rule = getSpellAreaRuleById(ruleId);
  return {
    id: "zone-1",
    position: { x: 0, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "root",
        instanceId: "instance-1",
        ruleId,
        spellId: rule?.spellId,
        casterId: "caster-1",
        pendingMarker: "preserved",
      },
      [AOE_AREA_META_KEY]: {
        type: "circle",
        start: { x: 0, y: 0 },
        end: { x: 50, y: 0 },
        dpi: 50,
        gridOrigin: { x: 0, y: 0 },
        basePosition: { x: 0, y: 0 },
      },
    },
    ...overrides,
  };
}

function eighteenMeterMovementRule() {
  const base = getSpellAreaRuleById("flaming-sphere:cast");
  return {
    ...base,
    id: "moonbeam:cast",
    spellId: "moonbeam",
    zonePolicy: {
      ...base.zonePolicy,
      movement: {
        ...base.zonePolicy.movement,
        maximumMeters: 18,
      },
    },
  };
}

function movement(ruleId, proposedPosition, overrides = {}) {
  const rule = ruleId === "moonbeam:cast"
    ? eighteenMeterMovementRule()
    : getSpellAreaRuleById(ruleId);
  const item = zone(ruleId, overrides.zoneItem);
  return planSpellZoneMovement({
    rule,
    zoneItem: item,
    initialPosition: overrides.initialPosition || item.position,
    proposedPosition,
    dpi: 50,
    scale,
    instanceId: overrides.instanceId || "instance-1",
    casterId: overrides.casterId || "caster-1",
    sceneEpoch: overrides.sceneEpoch,
    currentSceneEpoch: overrides.currentSceneEpoch,
    contactCandidates: overrides.contactCandidates || [],
    contactTargetId: overrides.contactTargetId,
    movementChoice: overrides.movementChoice,
  });
}

function sweptCircleRule() {
  const base = getSpellAreaRuleById("flaming-sphere:cast");
  return {
    ...base,
    id: "test:swept-circle:cast",
    zonePolicy: {
      ...base.zonePolicy,
      movement: {
        ...base.zonePolicy.movement,
        triggerOnAreaMove: true,
        stopOnFirstContact: false,
        sweptArea: true,
      },
    },
  };
}

function sweptMovement(proposedPosition, overrides = {}) {
  const rule = sweptCircleRule();
  const item = zone("moonbeam:cast", overrides.zoneItem);
  item.metadata[SPELL_STATIC_ZONE_META_KEY] = {
    ...item.metadata[SPELL_STATIC_ZONE_META_KEY],
    ruleId: rule.id,
    spellId: rule.spellId,
  };
  return planSpellZoneMovement({
    rule,
    zoneItem: item,
    initialPosition: overrides.initialPosition || item.position,
    proposedPosition,
    dpi: 50,
    scale,
    instanceId: overrides.instanceId || "instance-1",
    casterId: overrides.casterId || "caster-1",
    contactCandidates: overrides.contactCandidates || [],
  });
}

test("la conversione DPI/scala misura la distanza della zona in metri", () => {
  assert.equal(
    spellZoneMovementDistanceMeters({ x: 0, y: 0 }, { x: 100, y: 0 }, 50, scale),
    3,
  );
});

test("Bagliore Lunare accetta 18 m e rifiuta il movimento oltre il limite", () => {
  const accepted = movement("moonbeam:cast", { x: 600, y: 0 });
  assert.equal(accepted.valid, true);
  assert.deepEqual(accepted.finalPosition, { x: 600, y: 0 });
  assert.equal(accepted.distanceMeters, 18);
  assert.equal(
    zone("moonbeam:cast").metadata[SPELL_STATIC_ZONE_META_KEY].pendingMarker,
    "preserved",
  );

  const rejected = movement("moonbeam:cast", { x: 601, y: 0 });
  assert.equal(rejected.valid, false);
  assert.ok(rejected.errors.includes("movement-distance-exceeded"));
  assert.equal(rejected.sideEffectRequest, null);
});

test("il core rifiuta coordinate, istanza, scena e posizione iniziale stale", () => {
  const invalid = movement("moonbeam:cast", { x: Number.NaN, y: 0 });
  assert.ok(invalid.errors.includes("movement-proposed-position-invalid"));

  const staleInstance = movement("moonbeam:cast", { x: 50, y: 0 }, {
    instanceId: "other-instance",
  });
  assert.ok(staleInstance.errors.includes("movement-zone-instance-stale"));

  const staleScene = movement("moonbeam:cast", { x: 50, y: 0 }, {
    sceneEpoch: 4,
    currentSceneEpoch: 5,
  });
  assert.ok(staleScene.errors.includes("movement-scene-epoch-stale"));

  const stalePosition = movement("moonbeam:cast", { x: 50, y: 0 }, {
    initialPosition: { x: 0, y: 0 },
    zoneItem: { position: { x: 10, y: 0 } },
  });
  assert.ok(stalePosition.errors.includes("movement-initial-position-stale"));
});

test("Sfera Infuocata si arresta al primo contatto e conserva un solo bersaglio", () => {
  const result = movement("flaming-sphere:cast", { x: 300, y: 0 }, {
    contactCandidates: [{
      id: "target-1",
      bounds: { min: { x: 150, y: -20 }, max: { x: 180, y: 20 } },
    }],
  });

  assert.equal(result.valid, true);
  assert.equal(result.firstContact.targetId, "target-1");
  assert.deepEqual(result.firstContact.targetIds, ["target-1"]);
  assert.ok(result.finalPosition.x < 300);
  assert.equal(result.sideEffectRequest.contactTargetId, "target-1");
});

test("il contatto ambiguo richiede una scelta esplicita del GM", () => {
  const contactCandidates = [
    { id: "target-1", bounds: { min: { x: 150, y: -20 }, max: { x: 180, y: 20 } } },
    { id: "target-2", bounds: { min: { x: 150, y: -20 }, max: { x: 180, y: 20 } } },
  ];
  const ambiguous = movement("flaming-sphere:cast", { x: 300, y: 0 }, {
    contactCandidates,
  });
  assert.equal(ambiguous.valid, false);
  assert.ok(ambiguous.errors.includes("movement-contact-choice-required"));

  const chosen = movement("flaming-sphere:cast", { x: 300, y: 0 }, {
    contactCandidates,
    contactTargetId: "target-2",
  });
  assert.equal(chosen.valid, true);
  assert.equal(chosen.firstContact.targetId, "target-2");
});

test("un bersaglio soltanto nella corona non è un contatto diretto", () => {
  const rule = getSpellAreaRuleById("flaming-sphere:cast");
  const noCasterRule = {
    ...rule,
    zonePolicy: {
      ...rule.zonePolicy,
      membershipTargeting: {
        ...rule.zonePolicy.membershipTargeting,
        includeCaster: false,
      },
    },
  };
  const result = planSpellZoneMovement({
    rule: noCasterRule,
    zoneItem: zone("flaming-sphere:cast"),
    initialPosition: { x: 0, y: 0 },
    proposedPosition: { x: 300, y: 0 },
    dpi: 50,
    scale,
    instanceId: "instance-1",
    casterId: "caster-1",
    contactCandidates: [{
      id: "caster-1",
      bounds: { min: { x: 150, y: -20 }, max: { x: 180, y: 20 } },
    }],
  });
  assert.equal(result.valid, true);
  assert.equal(result.firstContact, null);
});

test("la scelta facoltativa del Diavoletto è validata nel piano", () => {
  const none = movement("xanathar-diavoletto-di-polvere:cast", { x: 100, y: 0 }, {
    movementChoice: "none",
  });
  assert.equal(none.valid, true);
  assert.equal(none.movementChoice, "none");

  const dust = movement("xanathar-diavoletto-di-polvere:cast", { x: 100, y: 0 }, {
    movementChoice: "dust-terrain",
  });
  assert.equal(dust.valid, true);
  assert.equal(dust.movementChoice, "dust-terrain");

  const unknown = movement("xanathar-diavoletto-di-polvere:cast", { x: 100, y: 0 }, {
    movementChoice: "unknown",
  });
  assert.equal(unknown.valid, false);
  assert.ok(unknown.errors.includes("movement-choice-invalid"));
});

test("lo swept circle separa fuori-path, swept-only, final e tangente", () => {
  const result = sweptMovement({ x: 300, y: 0 }, {
    contactCandidates: [
      {
        id: "outside",
        bounds: { min: { x: 140, y: 100 }, max: { x: 170, y: 130 } },
      },
      {
        id: "swept-only",
        bounds: { min: { x: 140, y: 40 }, max: { x: 170, y: 80 } },
      },
      {
        id: "final",
        bounds: { min: { x: 280, y: 0 }, max: { x: 320, y: 20 } },
      },
      {
        id: "swept-and-final",
        bounds: { min: { x: 260, y: 0 }, max: { x: 300, y: 20 } },
      },
      {
        id: "tangent",
        bounds: { min: { x: 140, y: 50 }, max: { x: 170, y: 70 } },
      },
      {
        id: "swept-only",
        bounds: { min: { x: 150, y: 40 }, max: { x: 180, y: 80 } },
      },
    ],
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.sweptTargetIds, [
    "swept-only",
    "final",
    "swept-and-final",
  ]);
  assert.deepEqual(result.crossingTargetIds, result.sweptTargetIds);
  assert.deepEqual(result.sideEffectRequest.sweptTargetIds, result.sweptTargetIds);
  assert.deepEqual(result.sideEffectRequest.crossingTargetIds, result.crossingTargetIds);
});

test("un target già dentro all'inizio e alla fine non diventa un nuovo crossing", () => {
  const result = sweptMovement({ x: 40, y: 0 }, {
    contactCandidates: [{
      id: "initial-and-final",
      bounds: { min: { x: -20, y: -20 }, max: { x: 30, y: 20 } },
    }],
  });

  assert.deepEqual(result.sweptTargetIds, ["initial-and-final"]);
  assert.deepEqual(result.crossingTargetIds, []);
});

test("zero movement non produce uno swept activation", () => {
  const result = sweptMovement({ x: 0, y: 0 }, {
    contactCandidates: [{
      id: "target",
      bounds: { min: { x: -20, y: -20 }, max: { x: 20, y: 20 } },
    }],
  });

  assert.deepEqual(result.sweptTargetIds, []);
  assert.deepEqual(result.crossingTargetIds, []);
});

test("la capability sweptArea è OFF di default per le zone esistenti", () => {
  const result = movement("moonbeam:cast", { x: 300, y: 0 }, {
    contactCandidates: [{
      id: "swept-only",
      bounds: { min: { x: 140, y: 40 }, max: { x: 170, y: 80 } },
    }],
  });

  assert.equal(result.movement.sweptArea, undefined);
  assert.equal(result.sweptTargetIds, undefined);
  assert.equal(result.sideEffectRequest.sweptTargetIds, undefined);
});

test("swept circle: performance smoke su 5000 occupancy bounds", () => {
  const contactCandidates = Array.from({ length: 5000 }, (_, index) => ({
    id: `target-${index}`,
    bounds: {
      min: { x: index * 60, y: 1000 },
      max: { x: index * 60 + 30, y: 1030 },
    },
  }));
  contactCandidates[2500] = {
    id: "path-target",
    bounds: { min: { x: 140, y: 40 }, max: { x: 170, y: 80 } },
  };
  const started = performance.now();
  const result = sweptMovement({ x: 300, y: 0 }, { contactCandidates });
  const elapsed = performance.now() - started;

  assert.deepEqual(result.sweptTargetIds, ["path-target"]);
  assert.ok(elapsed < 1000, `swept occupancy took ${elapsed.toFixed(1)} ms`);
});
