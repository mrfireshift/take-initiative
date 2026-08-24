import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  combatEventFromHistoryEntryV3,
  mergeCombatLogTurnContext,
  normalizeCombatLogEventV3,
  normalizeCombatLogRosterSnapshot,
  normalizeCombatLogSessionV3,
  nextCombatLogOrderRevision,
} from "../src/combatLogV3Core.js";
import { recordCombatTurnForEpoch } from "../src/combatLogTurnCore.js";

function fixture(name) {
  const file = path.join(process.cwd(), "test", "fixtures", "combat-log-v3", name);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("v2 legacy si normalizza in v3 senza inventare provenance o contesto turno", () => {
  const event = normalizeCombatLogEventV3({
    version: 2,
    kind: "hp",
    source: "automatic",
    turn: { id: "turn-token", name: "Turn token" },
    targets: [{
      id: "dars",
      name: "Dars",
      before: { hp: 792, hpMax: 1000 },
      after: { hp: 776, hpMax: 1000 },
      delta: -16,
      hpMaxDelta: 0,
    }],
    payload: { hpChange: { before: 792, after: 776, hpMax: 1000 } },
  });

  assert.equal(event.version, 3);
  assert.deepEqual(event.turnContext, {
    activeId: "turn-token",
    activeName: "Turn token",
    turnIndex: null,
    turnKey: null,
    orderRevision: null,
  });
  assert.deepEqual(event.provenance, {
    recordingSource: "unknown",
    actor: null,
    cause: null,
  });
  assert.deepEqual(event.facets.hp.targets[0], {
    id: "dars",
    name: "Dars",
    before: { hp: 792, hpMax: 1000 },
    after: { hp: 776, hpMax: 1000 },
    delta: -16,
    hpMaxDelta: 0,
  });
  assert.deepEqual(event.targets, [{ id: "dars", name: "Dars" }]);
  assert.equal(event.payload.hpChange, undefined);
  assert.equal(Object.hasOwn(event.turnContext, "actorId"), false);
  assert.equal(Object.hasOwn(event.turnContext, "actorName"), false);
});

test("reminder HP conserva hpMax noto e usa null quando non disponibile", () => {
  const known = normalizeCombatLogEventV3({
    version: 2,
    kind: "reminder-resolution",
    payload: {
      targetId: "bella",
      hpChange: { before: 112, after: 99, hpMax: 112 },
    },
  });
  assert.deepEqual(known.facets.hp.targets[0].before, { hp: 112, hpMax: 112 });
  assert.deepEqual(known.facets.hp.targets[0].after, { hp: 99, hpMax: 112 });

  const unknown = normalizeCombatLogEventV3({
    version: 2,
    kind: "reminder-resolution",
    payload: {
      targetId: "morgantha",
      hpChange: { before: 105, after: 94 },
    },
  });
  assert.equal(unknown.facets.hp.targets[0].before.hpMax, null);
  assert.equal(unknown.facets.hp.targets[0].after.hpMax, null);
  assert.equal(unknown.facets.hp.targets[0].hpMaxDelta, null);
});

test("un evento History eredita la orderRevision esplicita della sessione", () => {
  const turnContext = mergeCombatLogTurnContext(
    {
      activeId: "dars",
      activeName: "Dars",
      turnIndex: 2,
      turnKey: "1:dars",
      orderRevision: null,
    },
    {
      activeId: "dars",
      activeName: "Dars",
      turnIndex: 2,
      turnKey: "1:dars",
      orderRevision: null,
    },
    1,
  );
  assert.deepEqual(turnContext, {
    activeId: "dars",
    activeName: "Dars",
    turnIndex: 2,
    turnKey: "1:dars",
    orderRevision: 1,
  });
  assert.equal(mergeCombatLogTurnContext({}, {}, null).orderRevision, null);
});

test("reminder-resolution conserva gli snapshot HP soltanto nella facet canonica", () => {
  const event = combatEventFromHistoryEntryV3({
    id: "history-reminder-hp",
    kind: "reminder-resolution",
    payload: {
      targetId: "bella",
      hpChange: { before: 112, after: 99, hpMax: 112 },
    },
    changes: [{
      id: "bella",
      name: "Bella",
      beforeMetadata: { hp: { present: true, value: 112 }, hpMax: { present: true, value: 112 } },
      afterMetadata: { hp: { present: true, value: 99 }, hpMax: { present: true, value: 112 } },
      metadataFields: { hp: true },
    }],
  });
  assert.deepEqual(event.facets.hp.targets[0].before, { hp: 112, hpMax: 112 });
  assert.deepEqual(event.facets.hp.targets[0].after, { hp: 99, hpMax: 112 });
  assert.equal(Object.hasOwn(event.targets[0], "before"), false);
  assert.equal(Object.hasOwn(event.targets[0], "after"), false);
  assert.equal(event.payload.hpChange, undefined);
});

test("hpOperation distingue un edit manuale esplicito senza chiamare danno una variazione negativa", () => {
  const event = combatEventFromHistoryEntryV3({
    id: "manual-hp-edit",
    source: "manual",
    kind: "hp",
    changes: [{
      id: "dars",
      beforeMetadata: { hp: { present: true, value: 40 }, hpMax: { present: true, value: 100 } },
      afterMetadata: { hp: { present: true, value: 30 }, hpMax: { present: true, value: 90 } },
      metadataFields: { hp: true, hpMax: true },
    }],
  });
  assert.deepEqual(event.payload.hpOperation, { kind: "sheet-edit", fields: ["hp", "hpMax"] });
  assert.equal(event.facets.hp.action, "damage");
});

test("hpOperation non viene inferita dai delta e accetta il marker esplicito del producer", () => {
  const automatic = combatEventFromHistoryEntryV3({
    id: "automatic-hp-change",
    kind: "hp",
    label: "Modifica HP",
    changes: [{
      id: "dars",
      beforeMetadata: { hp: { present: true, value: 40 }, hpMax: { present: true, value: 100 } },
      afterMetadata: { hp: { present: true, value: 30 }, hpMax: { present: true, value: 100 } },
      metadataFields: { hp: true },
    }],
  });
  assert.equal(automatic.payload.hpOperation, undefined);

  const explicit = combatEventFromHistoryEntryV3({
    id: "explicit-hp-operation",
    kind: "hp",
    payload: { hpOperation: { kind: "sheet-edit", fields: ["hp"] } },
    changes: [{
      id: "dars",
      beforeMetadata: { hp: { present: true, value: 40 }, hpMax: { present: true, value: 100 } },
      afterMetadata: { hp: { present: true, value: 30 }, hpMax: { present: true, value: 100 } },
      metadataFields: { hp: true },
    }],
  });
  assert.deepEqual(explicit.payload.hpOperation, { kind: "sheet-edit", fields: ["hp"] });
  assert.equal(Object.hasOwn(explicit.facets.hp.targets[0], "before"), true);
  assert.equal(Object.hasOwn(explicit.payload, "hpChange"), false);
});

test("movement origin resta unknown senza marker e accetta solo un'origine esplicita", () => {
  const nativeHistoryMove = combatEventFromHistoryEntryV3({
    id: "history-scene-move",
    kind: "move",
    changes: [{
      id: "token",
      name: "Token",
      beforePosition: { x: 0, y: 0 },
      afterPosition: { x: 900, y: 0 },
      movement: { cells: 6 },
    }],
  });
  assert.equal(nativeHistoryMove.facets.movement.origin.kind, "unknown");

  const explicitlyMarked = combatEventFromHistoryEntryV3({
    id: "history-explicit-scene-drag",
    kind: "move",
    payload: { movement: { origin: { kind: "scene-drag" } } },
    changes: [{
      id: "token",
      name: "Token",
      beforePosition: { x: 0, y: 0 },
      afterPosition: { x: 900, y: 0 },
      movement: { cells: 6 },
    }],
  });
  assert.equal(explicitlyMarked.facets.movement.origin.kind, "scene-drag");
});

test("removed conserva removalReason/causeHistoryEntryId sul singolo elemento e lineage è per elemento", () => {
  const event = normalizeCombatLogEventV3({
    version: 3,
    kind: "condition",
    facets: {
      conditions: {
        added: [{ id: "prone", lineage: { relation: "derived" } }],
        updated: [{ id: "stunned", before: { active: true }, after: { active: false } }],
        removed: [{ id: "poisoned", removalReason: "expired", causeHistoryEntryId: "history-9" }],
        removalReason: "must-not-be-global",
        causeHistoryEntryId: "must-not-be-global",
      },
    },
  });
  const conditions = event.facets.conditions;
  assert.deepEqual(conditions.added[0].lineage, { relation: "derived" });
  assert.equal(conditions.updated[0].lineage, null);
  assert.equal(conditions.removed[0].removalReason, "expired");
  assert.equal(conditions.removed[0].causeHistoryEntryId, "history-9");
  assert.equal(conditions.removed[0].lineage, null);
  assert.equal(conditions.removalReason, undefined);
  assert.equal(conditions.causeHistoryEntryId, undefined);
});

test("il producer propaga solo le cause esplicite delle rimozioni", () => {
  const concentration = normalizeCombatLogEventV3({
    version: 3,
    kind: "reminder-resolution",
    payload: {
      outcome: "failed",
      replay: {
        type: "concentration-warning",
        warning: {
          notice: {
            causeHistoryEntryId: "history-hp-1",
            resolution: {
              outcomes: {
                failed: {
                  actions: [{ kind: "concentration", action: "break" }],
                },
              },
            },
          },
        },
      },
    },
    facets: {
      conditions: {
        removed: [{ id: "slow" }],
        targets: [{ id: "dars", removed: [{ id: "slow" }] }],
      },
      spells: { removed: [{ id: "spirit-guardians" }] },
      concentrations: { removed: [{ id: "spirit-guardians" }] },
    },
  });
  for (const facet of [
    concentration.facets.conditions,
    concentration.facets.spells,
    concentration.facets.concentrations,
  ]) {
    for (const item of facet.removed) {
      assert.equal(item.removalReason, "concentration-break");
      assert.equal(item.causeHistoryEntryId, "history-hp-1");
    }
  }
  assert.equal(
    concentration.facets.conditions.targets[0].removed[0].removalReason,
    "concentration-break",
  );
  assert.equal(
    concentration.facets.conditions.targets[0].removed[0].causeHistoryEntryId,
    "history-hp-1",
  );

  const saveSuccess = normalizeCombatLogEventV3({
    version: 3,
    kind: "reminder-resolution",
    payload: {
      outcome: "passed",
      replay: {
        descriptor: {
          notice: {
            resolution: {
              outcomes: {
                passed: {
                  actions: [{ kind: "condition", action: "remove-instance" }],
                },
              },
            },
          },
        },
      },
    },
    facets: { conditions: { removed: [{ id: "paralyzed" }] } },
  });
  assert.equal(saveSuccess.facets.conditions.removed[0].removalReason, "save-success");
  assert.equal(saveSuccess.facets.conditions.removed[0].causeHistoryEntryId, null);

  const temporal = normalizeCombatLogEventV3({
    version: 3,
    kind: "effects:tick-boundaries",
    facets: { spells: { removed: [{ id: "command", expiry: { mode: "turn-end" } }] } },
  });
  assert.equal(temporal.facets.spells.removed[0].removalReason, "temporal-expiry");

  const manual = normalizeCombatLogEventV3({
    version: 3,
    kind: "class-feature",
    facets: {
      conditions: {
        removed: [{
          id: "rage",
          type: "class-feature",
          manualRemoval: true,
        }],
      },
    },
  });
  assert.equal(manual.facets.conditions.removed[0].removalReason, "manual-removal");
});

test("class-feature usa source esplicito per actor e cause senza usare il turno", () => {
  const event = normalizeCombatLogEventV3({
    version: 3,
    kind: "class-feature",
    turnContext: {
      activeId: "other-token",
      activeName: "Altro token",
      turnIndex: 7,
      turnKey: "2:other-token",
      orderRevision: 1,
    },
    provenance: { recordingSource: "history-observer", actor: null, cause: null },
    facets: {
      conditions: {
        added: [{
          id: "rage-1",
          condition: "Ira",
          type: "class-feature",
          sourceId: "karmakar",
          sourceName: "Karmakar",
          effectId: "barbaro-ira",
          parentEffectId: "feature-1",
        }],
      },
    },
  });
  assert.deepEqual(event.provenance.actor, {
    id: "karmakar",
    name: "Karmakar",
    role: "source",
  });
  assert.deepEqual(event.provenance.cause, {
    kind: "class-feature",
    sourceId: "karmakar",
    sourceName: "Karmakar",
    effectId: "barbaro-ira",
    parentEffectId: "feature-1",
  });
});

test("la normalizzazione applica i campi per-elemento anche ai target scoped e rinomina roster.final", () => {
  const event = normalizeCombatLogEventV3({
    version: 2,
    kind: "condition",
    facets: {
      conditions: {
        targets: [{
          id: "target",
          removed: [{ id: "stunned", removalReason: "expired", causeHistoryEntryId: "history-10" }],
          removalReason: "must-not-be-target-global",
        }],
      },
    },
  });
  const removed = event.facets.conditions.targets[0].removed[0];
  assert.equal(removed.removalReason, "expired");
  assert.equal(removed.causeHistoryEntryId, "history-10");
  assert.equal(Object.hasOwn(event.facets.conditions.targets[0], "removalReason"), false);

  const session = normalizeCombatLogSessionV3({
    id: "session-1",
    roster: { final: { capturedAt: 10, orderIds: ["target"], entries: [] } },
  });
  assert.ok(session.roster.atExport);
  assert.equal(session.roster.atExport.capturedAt, 10);
  assert.equal(Object.hasOwn(session.roster, "final"), false);
});

test("fixture legacy e fixture native separano fedeltà v2 da lineage v3", () => {
  const legacy = fixture("legacy-v2-normalized.json");
  const native = fixture("native-v3-expected.json");
  assert.equal(legacy.facets.conditions.added[0].lineage, null);
  assert.deepEqual(native.facets.conditions.added[0].lineage, {
    relation: "derived",
    parentEffectId: "effect-unconscious-1",
    parentInstanceId: "condition-unconscious-1",
    causeHistoryEntryId: "history-zero-hp-1",
  });
});

test("Passo Velato è un solo evento spell con movement system-effect", () => {
  const event = combatEventFromHistoryEntryV3({
    id: "history-teleport",
    kind: "spell",
    label: "Lancio incantesimo · Passo velato",
    payload: {
      causality: {
        cause: { kind: "spell", spellId: "misty-step", spellName: "Passo velato" },
        actor: { id: "caster", name: "Caster" },
      },
    },
    effectsMutation: {
      sideEffects: [{
        type: "token:teleport",
        id: "caster",
        name: "Caster",
        beforePosition: { x: 3075, y: -2775 },
        afterPosition: { x: 2175, y: -2775 },
      }],
    },
  });
  assert.equal(event.kind, "spell");
  assert.equal(event.facets.movement.origin.kind, "system-effect");
  assert.deepEqual(event.facets.movement.targets[0].from, { x: 3075, y: -2775 });
  assert.deepEqual(event.facets.movement.targets[0].to, { x: 2175, y: -2775 });
  assert.equal(event.provenance.actor.id, "caster");
  assert.equal(event.provenance.cause.spellId, "misty-step");
});

test("initiative-card update espone un diff esplicito senza creare un secondo evento", () => {
  const event = combatEventFromHistoryEntryV3({
    id: "history-card-1",
    kind: "initiative-card",
    label: "Scheda aggiornata",
    changes: [{
      id: "dars",
      name: "Dars",
      beforeMetadata: { initiativeCard: { level: 4 }, hp: 20 },
      afterMetadata: { initiativeCard: { level: 5 }, hp: 20 },
    }],
  });
  assert.equal(event.kind, "initiative-card");
  assert.deepEqual(event.facets.initiativeCard.diff.changedFields, ["initiativeCard"]);
  assert.deepEqual(event.facets.initiativeCard.diff.before, { initiativeCard: { level: 4 } });
  assert.deepEqual(event.facets.initiativeCard.diff.after, { initiativeCard: { level: 5 } });
});

test("il producer v3 cattura il lineage del Prono automatico dal marker esplicito dell'ID", () => {
  const event = combatEventFromHistoryEntryV3({
    id: "history-zero-hp-1",
    kind: "condition",
    changes: [{
      id: "dars",
      before: { conditions: { instances: [] } },
      after: {
        conditions: {
          instances: [
            { id: "unconscious", condition: "Privo di sensi", type: "hp-zero" },
            { id: "unconscious:automatic:prono", condition: "Prono", type: "automatic" },
          ],
        },
      },
    }],
  });
  const prone = event.facets.conditions.added.find((item) => item.condition === "Prono");
  assert.deepEqual(prone.lineage, {
    relation: "derived",
    parentInstanceId: "unconscious",
    parentEffectId: null,
    parentCondition: "Privo di sensi",
    causeHistoryEntryId: "history-zero-hp-1",
  });
});

test("un ID Prono non marcato non riceve lineage sintetico", () => {
  const event = combatEventFromHistoryEntryV3({
    id: "history-manual-condition",
    kind: "condition",
    changes: [{
      id: "dars",
      before: { conditions: { instances: [] } },
      after: { conditions: { instances: [{ id: "manual-prone", condition: "Prono" }] } },
    }],
  });
  const prone = event.facets.conditions.added[0];
  assert.equal(prone.lineage, null);
});

test("orderRevision resta invariata durante il turno e cresce solo con ordine strutturale diverso", () => {
  const first = nextCombatLogOrderRevision({}, ["a", "b"]);
  const same = nextCombatLogOrderRevision(first, ["a", "b"]);
  const changed = nextCombatLogOrderRevision(same, ["b", "a"]);
  assert.deepEqual(first, { orderRevision: 1, orderSignature: '["a","b"]' });
  assert.deepEqual(same, first);
  assert.equal(changed.orderRevision, 2);
});

test("il cambio strutturale dell'ordine cattura una sola fotografia roster sul turno", async () => {
  const stored = {
    id: "session-order",
    lastRound: 1,
    lastTurnKey: "1:a",
    nextSequence: 3,
    orderRevision: 1,
    orderSignature: '["a","b"]',
    roster: { initial: { orderIds: ["a", "b"] } },
  };
  const appended = [];
  await recordCombatTurnForEpoch({
    state: { order: ["b", "a"], current: 1, round: 1 },
    sceneEpoch: 1,
    isCurrent: () => true,
    ensureSession: async () => stored,
    getStoredSession: async () => stored,
    resolveTurn: async (id) => ({ id, name: id.toUpperCase() }),
    resolveRoster: async (state, options) => ({
      capturedAt: 20,
      capturedAtSequence: options.capturedAtSequence,
      orderRevision: options.orderRevision,
      orderIds: state.order,
      entries: state.order.map((id) => ({ id, name: id.toUpperCase() })),
    }),
    appendEvents: async (_sessionId, inputs, patch) => {
      appended.push({ inputs, patch });
      return inputs;
    },
  });
  assert.equal(appended.length, 1);
  const turnEvent = appended[0].inputs.find((event) => event.kind === "turn");
  assert.deepEqual(turnEvent.facets.roster.orderIds, ["b", "a"]);
  assert.equal(turnEvent.facets.roster.orderRevision, 2);
  assert.equal(appended[0].inputs.filter((event) => event.facets?.roster).length, 1);
});

test("roster snapshot non sostituisce numeri sconosciuti con zero", () => {
  const snapshot = normalizeCombatLogRosterSnapshot({
    capturedAt: 100,
    capturedAtSequence: 4,
    orderRevision: 1,
    orderIds: ["a"],
    entries: [{ id: "a", name: "A", attitude: "ally" }],
  });
  assert.equal(snapshot.entries[0].hp, null);
  assert.equal(snapshot.entries[0].hpMax, null);
  assert.equal(snapshot.entries[0].initiative, null);
});
