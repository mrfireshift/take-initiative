import test from "node:test";
import assert from "node:assert/strict";
import {
  activeClassFeatureInstances,
  classFeatureConditionResourceDie,
  classFeatureConditionInstancesForActivation,
  classFeatureEffectProjection,
  classFeatureTargetIds,
  classFeatureTargetWithinRange,
  classFeatureTargeting,
  classFeatureResourceEntries,
  planClassFeatureActivation,
  planClassFeatureDeactivation,
  planClassFeatureResourceAdjustment,
  planClassFeatureResourceReset,
  sanitizeCharacterBuild,
} from "../src/classFeatureCore.js";

const build = [{ classId: "barbaro", level: 3, subclassId: "" }];
const ragePool = {
  id: "barbaro-ira-usi",
  name: "Ira",
  capacity: { type: "class_progression", class_id: "barbaro" },
  maximumByClassLevel: { "1": 2, "2": 2, "3": 3 },
};
const pools = new Map([[ragePool.id, ragePool]]);

test("risolve il dado di Ispirazione Bardica dalla build del Bardo", () => {
  const bardic = {
    id: "bardo-ispirazione-bardica",
    type: "class-feature",
    condition: "Ispirazione Bardica",
  };
  assert.equal(
    classFeatureConditionResourceDie(bardic, [{ classId: "bardo", level: 4 }]),
    "d6",
  );
  assert.equal(
    classFeatureConditionResourceDie(bardic, [{ classId: "bardo", level: 12 }]),
    "d10",
  );
  assert.equal(
    classFeatureConditionResourceDie(bardic, [{ classId: "bardo", level: 17 }]),
    "d12",
  );
  assert.equal(
    classFeatureConditionResourceDie(
      { id: "stregone-metamagia", type: "condition", condition: "Ispirazione Bardica" },
      [{ classId: "bardo", level: 12 }],
    ),
    null,
  );
});

test("normalizza una build multiclasse senza duplicare classi", () => {
  assert.deepEqual(sanitizeCharacterBuild([
    { classId: "barbaro", level: 3 },
    { classId: "paladino", level: 2, subclassId: "vendetta" },
    { classId: "barbaro", level: 10 },
  ]), [
    { classId: "barbaro", level: 3, subclassId: "" },
    { classId: "paladino", level: 2, subclassId: "vendetta" },
  ]);
});

test("l'attivazione consuma la risorsa e crea un'istanza a durata", () => {
  const feature = {
    id: "barbaro-ira",
    trackingMode: "active",
    duration: { rounds: 10 },
    resourceCosts: [{ poolId: ragePool.id, amount: 1 }],
  };
  const result = planClassFeatureActivation({
    feature,
    poolsById: pools,
    characterBuild: build,
    sourceId: "barbaro-token",
    targetIds: ["barbaro-token"],
    currentRound: 4,
    instanceId: "rage-1",
    createdAt: 123,
  });

  assert.equal(result.ok, true);
  assert.equal(result.state.resources[ragePool.id].current, 2);
  assert.equal(result.instance.startedRound, 4);
  assert.equal(result.instance.expiresRound, 13);
  assert.equal(activeClassFeatureInstances(result.state, 13).length, 1);
  assert.equal(activeClassFeatureInstances(result.state, 14).length, 0);
});

test("una capacità attiva su sé stessa non crea una seconda istanza", () => {
  const feature = {
    id: "barbaro-ira",
    trackingMode: "active",
    duration: { rounds: 10 },
    resourceCosts: [{ poolId: ragePool.id, amount: 1 }],
  };
  const first = planClassFeatureActivation({
    feature,
    poolsById: pools,
    characterBuild: build,
    sourceId: "barbaro-token",
    targetIds: ["barbaro-token"],
    currentRound: 4,
    instanceId: "rage-1",
  });
  const duplicate = planClassFeatureActivation({
    state: first.state,
    feature,
    poolsById: pools,
    characterBuild: build,
    sourceId: "barbaro-token",
    targetIds: ["barbaro-token"],
    currentRound: 4,
    instanceId: "rage-2",
  });

  assert.equal(first.ok, true);
  assert.deepEqual(duplicate, { ok: false, reason: "feature-already-active" });
  assert.equal(first.state.resources[ragePool.id].current, 2);
  assert.equal(first.state.instances.length, 1);
});

test("una capacità a bersaglio può restare attiva su bersagli diversi", () => {
  const feature = {
    id: "bardo-ispirazione-bardica",
    trackingMode: "active",
    targeting: { mode: "single-target", maxTargets: 1 },
    duration: { rounds: 10 },
  };
  const first = planClassFeatureActivation({
    feature,
    poolsById: new Map(),
    characterBuild: build,
    sourceId: "bardo-token",
    targetIds: ["bersaglio-a"],
    currentRound: 4,
    instanceId: "inspiration-1",
  });
  const sameTarget = planClassFeatureActivation({
    state: first.state,
    feature,
    poolsById: new Map(),
    characterBuild: build,
    sourceId: "bardo-token",
    targetIds: ["bersaglio-a"],
    currentRound: 4,
    instanceId: "inspiration-2",
  });
  const otherTarget = planClassFeatureActivation({
    state: first.state,
    feature,
    poolsById: new Map(),
    characterBuild: build,
    sourceId: "bardo-token",
    targetIds: ["bersaglio-b"],
    currentRound: 4,
    instanceId: "inspiration-3",
  });

  assert.deepEqual(sameTarget, { ok: false, reason: "feature-already-active" });
  assert.equal(otherTarget.ok, true);
  assert.equal(otherTarget.state.instances.length, 2);
});

test("Ira Persistente rende indefinita l'istanza di Ira quando la capacità è abilitata", () => {
  const feature = {
    id: "barbaro-ira",
    trackingMode: "active",
    duration: { rounds: 10, indefiniteWithFeatureId: "barbaro-ira-persistente" },
  };
  const withPersistentRage = planClassFeatureActivation({
    feature,
    poolsById: new Map(),
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 4,
    instanceId: "rage-persistent",
    enabledFeatureIds: ["barbaro-ira-persistente"],
  });
  assert.equal(withPersistentRage.ok, true);
  assert.equal(withPersistentRage.instance.expiresRound, null);

  const withFiniteRage = planClassFeatureActivation({
    feature,
    poolsById: new Map(),
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 4,
    instanceId: "rage-finite",
  });
  assert.equal(withFiniteRage.instance.expiresRound, 13);
});

test("le mechanics di movimento del piano diventano parte dell'istanza", () => {
  const feature = {
    id: "eagle-attunement",
    trackingMode: "active",
    effectPlan: {
      kind: "condition",
      conditionName: "Sintonia Totemica: Aquila",
      mechanics: { movement: { modes: { fly: { copyFrom: "walk" } } } },
    },
  };
  const projection = classFeatureEffectProjection(feature);
  assert.deepEqual(projection.mechanics.movement.modes.fly, { copyFrom: "walk" });
  const instance = classFeatureConditionInstancesForActivation(feature, {
    instanceId: "eagle-1",
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    startedRound: 1,
  })[0];
  assert.deepEqual(instance.mechanics.movement.modes.fly, { copyFrom: "walk" });
});

test("una capacità istantanea consuma la risorsa senza restare attiva", () => {
  const result = planClassFeatureActivation({
    feature: {
      id: "azione-istantanea",
      trackingMode: "instant",
      duration: { rounds: null },
      resourceCosts: [{ poolId: ragePool.id, amount: 1 }],
    },
    poolsById: pools,
    characterBuild: build,
    sourceId: "barbaro-token",
    currentRound: 1,
    instanceId: "instant-1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.instance.instanceId, "instant-1");
  assert.equal(result.instance.featureId, "azione-istantanea");
  assert.equal(result.instance.parentFeatureId, undefined);
  assert.equal(result.instance.parentInstanceId, undefined);
  assert.equal(result.state.instances.length, 0);
  assert.equal(result.state.resources[ragePool.id].current, 2);
});

test("un costo variabile richiede un intero positivo e consuma il valore scelto", () => {
  const feature = {
    id: "paladino-imposizione-delle-mani",
    trackingMode: "instant",
    resourceCosts: [{ poolId: ragePool.id, amount: 1, variable: true }],
  };
  const spent = planClassFeatureActivation({
    feature,
    poolsById: pools,
    characterBuild: build,
    sourceId: "paladin",
    targetIds: ["target"],
    instanceId: "lay-on-hands-1",
    resourceValues: { [ragePool.id]: 2 },
  });
  assert.equal(spent.ok, true);
  assert.equal(spent.state.resources[ragePool.id].current, 1);

  assert.deepEqual(planClassFeatureActivation({
    feature,
    poolsById: pools,
    characterBuild: build,
    sourceId: "paladin",
    instanceId: "lay-on-hands-2",
  }), {
    ok: false,
    reason: "resource-value-required",
    poolId: ragePool.id,
  });
  assert.deepEqual(planClassFeatureActivation({
    feature,
    poolsById: pools,
    characterBuild: build,
    sourceId: "paladin",
    instanceId: "lay-on-hands-3",
    resourceValues: { [ragePool.id]: 1.5 },
  }), {
    ok: false,
    reason: "resource-value-required",
    poolId: ragePool.id,
  });
});

test("l'attivazione è atomica quando la risorsa è esaurita", () => {
  const state = {
    resources: {
      [ragePool.id]: { current: 0, maximum: 3, unlimited: false },
    },
    instances: [],
  };
  const result = planClassFeatureActivation({
    state,
    feature: {
      id: "barbaro-ira",
      duration: { rounds: 10 },
      resourceCosts: [{ poolId: ragePool.id, amount: 1 }],
    },
    poolsById: pools,
    characterBuild: build,
    sourceId: "barbaro-token",
    currentRound: 1,
    instanceId: "rage-2",
  });

  assert.deepEqual(result, {
    ok: false,
    reason: "resource-empty",
    poolId: ragePool.id,
  });
  assert.equal(state.instances.length, 0);
});

test("le risorse possono essere modificate, ripristinate e riepilogate", () => {
  const spent = planClassFeatureResourceAdjustment(
    null,
    ragePool,
    build,
    { delta: -1 },
  );
  assert.equal(spent.state.resources[ragePool.id].current, 2);

  const reset = planClassFeatureResourceAdjustment(
    spent.state,
    ragePool,
    build,
    { reset: true },
  );
  assert.equal(reset.state.resources[ragePool.id].current, 3);

  const entries = classFeatureResourceEntries(
    reset.state,
    [{ resourceCosts: [{ poolId: ragePool.id, amount: 1 }] }],
    pools,
    build,
  );
  assert.equal(entries[0].maximum, 3);
  assert.equal(entries[0].current, 3);
});

test("il passaggio dal livello 20 a un livello finito ricalcola il pool", () => {
  const progressivePool = {
    id: "barbaro-ira-progressione",
    name: "Ire",
    capacity: { type: "class_progression", class_id: "barbaro" },
    maximumByClassLevel: { "19": 6, "20": "illimitate" },
  };
  const state = {
    resources: {
      [progressivePool.id]: { current: null, maximum: null, unlimited: true },
    },
  };
  const finiteBuild = [{ classId: "barbaro", level: 19, subclassId: "" }];
  const entries = classFeatureResourceEntries(
    state,
    [{ resourceCosts: [{ poolId: progressivePool.id, amount: 1 }] }],
    new Map([[progressivePool.id, progressivePool]]),
    finiteBuild,
  );
  assert.deepEqual(entries[0], {
    pool: progressivePool,
    current: 6,
    maximum: 6,
    unlimited: false,
  });
  const adjusted = planClassFeatureResourceAdjustment(
    state,
    progressivePool,
    finiteBuild,
    { reset: true },
  );
  assert.deepEqual(adjusted.state.resources[progressivePool.id], {
    current: 6,
    maximum: 6,
    unlimited: false,
  });
});

test("il reset ripristina tutte le risorse passate al piano", () => {
  const secondPool = {
    id: "paladino-giuramento-usi",
    name: "Giuramento",
    capacity: { type: "fixed", value: 2 },
  };
  const result = planClassFeatureResourceReset({
    resources: {
      [ragePool.id]: { current: 0, maximum: 3, unlimited: false },
      [secondPool.id]: { current: 0, maximum: 2, unlimited: false },
    },
  }, new Map([
    [ragePool.id, ragePool],
    [secondPool.id, secondPool],
  ]), build, [ragePool.id, secondPool.id]);

  assert.equal(result.changed, true);
  assert.deepEqual(result.poolIds, [ragePool.id, secondPool.id]);
  assert.equal(result.state.resources[ragePool.id].current, 3);
  assert.equal(result.state.resources[secondPool.id].current, 2);
});

test("un'istanza attiva può essere terminata manualmente", () => {
  const result = planClassFeatureDeactivation({
    instances: [{
      instanceId: "rage-1",
      featureId: "barbaro-ira",
      sourceId: "barbaro-token",
    }],
  }, "rage-1");
  assert.equal(result.changed, true);
  assert.equal(result.state.instances.length, 0);
});

test("le proiezioni delle capacità rispettano caster, bersaglio e aura", () => {
  const rage = {
    id: "barbaro-ira",
    name: "Ira",
    targetMode: "self",
    targeting: { mode: "self", maxTargets: 1, excludeSource: false },
    effectPlan: { kind: "condition", conditionName: "Ira", detail: "Ira" },
  };
  const vow = {
    id: "vow",
    name: "Giuramento di Inimicizia",
    targetMode: "selection",
    targeting: { mode: "single-target", maxTargets: 1, excludeSource: true },
    effectPlan: { kind: "condition", conditionName: "Giuramento di Inimicizia" },
  };
  const aura = {
    id: "twilight",
    name: "Santuario del Crepuscolo",
    targeting: { mode: "aura", rangeMeters: 9, maxTargets: null },
    effectPlan: { kind: "aura", conditionName: "Santuario del Crepuscolo", radiusMeters: 9 },
  };
  const activation = {
    instanceId: "activation-1",
    sourceId: "caster",
    targetIds: ["target"],
    startedRound: 4,
    expiresRound: 13,
  };

  assert.equal(classFeatureTargeting(vow).excludeSource, true);
  assert.equal(classFeatureEffectProjection(aura).kind, "aura");
  assert.deepEqual(
    classFeatureConditionInstancesForActivation(rage, {
      ...activation,
      targetIds: ["caster"],
    }, "Barbaro").map((entry) => ({
      id: entry.id,
      targetId: entry.targetId,
      sourceId: entry.sourceId,
      parentEffectId: entry.parentEffectId,
      condition: entry.condition,
      type: entry.type,
      remaining: entry.expiry.remaining,
    })),
    [{
      id: "class-feature:activation-1:caster",
      targetId: "caster",
      sourceId: "caster",
      parentEffectId: "activation-1",
      condition: "Ira",
      type: "class-feature",
      remaining: 10,
    }],
  );
  assert.equal(
    classFeatureConditionInstancesForActivation(vow, activation, "Paladino")[0].targetId,
    "target",
  );
  assert.equal(
    classFeatureConditionInstancesForActivation(aura, activation, "Chierico")[0].targetId,
    "caster",
  );
});

test("una Feature non automatizzata non genera pill né attivazioni", () => {
  const feature = {
    id: "manual-only",
    name: "Recuperare Energie",
    runtimeSupport: { status: "not-automated", reason: "adapter-not-implemented" },
    effectPlan: { kind: "condition", conditionName: "Recuperare Energie" },
  };
  assert.equal(classFeatureEffectProjection(feature).kind, "none");
  assert.deepEqual(
    classFeatureConditionInstancesForActivation(feature, {
      instanceId: "manual-1",
      sourceId: "source",
      targetIds: ["source"],
    }),
    [],
  );
  assert.deepEqual(
    planClassFeatureActivation({
      feature,
      poolsById: new Map(),
      characterBuild: build,
      sourceId: "source",
      instanceId: "manual-1",
    }),
    { ok: false, reason: "feature-not-automated" },
  );
});

test("la portata usa l'ingombro dei token e rifiuta bersagli oltre il limite", () => {
  const source = {
    position: { x: 75, y: 75 },
    size: { width: 150, height: 150 },
  };
  const near = {
    position: { x: 375, y: 75 },
    size: { width: 150, height: 150 },
  };
  const far = {
    position: { x: 525, y: 75 },
    size: { width: 150, height: 150 },
  };
  assert.equal(classFeatureTargetWithinRange(source, near, 2, 150), true);
  assert.equal(classFeatureTargetWithinRange(source, far, 2, 150), false);
});

test("terminare Ira rimuove anche le varianti collegate", () => {
  const result = planClassFeatureDeactivation({
    instances: [
      {
        instanceId: "rage-parent",
        featureId: "barbaro-ira",
        sourceId: "barbarian",
      },
      {
        instanceId: "frenzy-child",
        featureId: "barbaro-frenesia",
        sourceId: "barbarian",
        parentFeatureId: "barbaro-ira",
        parentInstanceId: "rage-parent",
      },
      {
        instanceId: "nested-child",
        featureId: "barbaro-variante",
        sourceId: "barbarian",
        parentFeatureId: "barbaro-frenesia",
        parentInstanceId: "frenzy-child",
      },
    ],
  }, "rage-parent");
  assert.deepEqual(result.removedInstanceIds.sort(), [
    "frenzy-child",
    "nested-child",
    "rage-parent",
  ]);
  assert.equal(result.state.instances.length, 0);
});

test("la normalizzazione dei bersagli distingue caster, singolo target e aura", () => {
  const vow = {
    targeting: { mode: "single-target", maxTargets: 1, excludeSource: true },
  };
  const rage = { targeting: { mode: "self" } };
  const aura = { targeting: { mode: "aura" } };
  assert.deepEqual(classFeatureTargetIds(vow, "caster", ["caster", "enemy"]), ["enemy"]);
  assert.deepEqual(classFeatureTargetIds(rage, "caster", ["enemy"]), ["caster"]);
  assert.deepEqual(classFeatureTargetIds(aura, "caster", ["enemy"]), ["caster"]);
});
