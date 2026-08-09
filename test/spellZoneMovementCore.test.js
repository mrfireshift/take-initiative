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

function movement(ruleId, proposedPosition, overrides = {}) {
  const rule = getSpellAreaRuleById(ruleId);
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
