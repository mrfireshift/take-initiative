import test from "node:test";
import assert from "node:assert/strict";

import { buildCoordinatedEffectsUndoPlan } from "../src/effectsMutationUndoCore.js";
import { buildHistoryUndoPlan } from "../src/historyUndoCore.js";

const snapshot = (value) => ({ present: true, value });

function targetState(hp) {
  return {
    id: "target",
    conditions: [],
    spells: [],
    concentrations: {},
    metadata: { hp },
  };
}

function wall(length) {
  return {
    id: "wall-root",
    position: { x: 0, y: 0 },
    commands: [{ command: "wall", length }],
    metadata: {
      "plugin/aoeArea": { type: "line", length },
    },
  };
}

test("Muro di Luce annulla atomicamente danno e accorciamento della geometria", () => {
  const beforeWall = wall(18);
  const afterWall = wall(15);
  const entry = {
    id: "wall-beam",
    effectsMutation: {
      changes: [{
        id: "target",
        fields: {},
        before: {},
        after: {},
        metadataFields: { hp: true },
        beforeMetadata: { hp: snapshot(20) },
        afterMetadata: { hp: snapshot(12) },
      }],
      sideEffects: [{ id: "wall-root", before: beforeWall, after: afterWall }],
    },
  };

  const plan = buildCoordinatedEffectsUndoPlan({
    currentStates: [targetState(12)],
    sceneItems: [afterWall],
    entryOrEntries: [entry],
    metadataKeys: {
      conditions: "conditions",
      spells: "plugin/spells",
      concentrations: "plugin/concentration",
    },
  });

  assert.equal(plan.status, undefined);
  assert.equal(plan.changes.length, 1);
  assert.deepEqual(plan.changes[0].afterMetadata.hp, snapshot(20));
  assert.equal(plan.undoSideEffects.length, 1);
  assert.equal(plan.undoSideEffects[0].type, "item");
  assert.deepEqual(plan.undoSideEffects[0].restore, beforeWall);
});

test("Undo-through di Muro di Luce continua sulle entry precedenti senza conflict", () => {
  const beforeWall = wall(18);
  const afterWall = wall(15);
  const wallEntry = {
    id: "wall-beam",
    effectsMutation: {
      changes: [{
        id: "target",
        fields: {},
        before: {},
        after: {},
        metadataFields: { hp: true },
        beforeMetadata: { hp: snapshot(20) },
        afterMetadata: { hp: snapshot(12) },
      }],
      sideEffects: [{ id: "wall-root", before: beforeWall, after: afterWall }],
    },
  };
  const olderEntry = {
    id: "older-hp-change",
    effectsMutation: {
      changes: [{
        id: "target",
        fields: {},
        before: {},
        after: {},
        metadataFields: { hp: true },
        beforeMetadata: { hp: snapshot(25) },
        afterMetadata: { hp: snapshot(20) },
      }],
      sideEffects: [],
    },
  };

  const plan = buildCoordinatedEffectsUndoPlan({
    currentStates: [targetState(12)],
    sceneItems: [afterWall],
    entryOrEntries: [wallEntry, olderEntry],
    metadataKeys: {
      conditions: "conditions",
      spells: "plugin/spells",
      concentrations: "plugin/concentration",
    },
  });

  assert.equal(plan.status, undefined);
  assert.deepEqual(plan.changes[0].afterMetadata.hp, snapshot(25));
  assert.deepEqual(plan.undoSideEffects[0].restore, beforeWall);
});

test("Undo dell'ultima sezione ripristina muro, spell, concentrazione e danno nello stesso piano", () => {
  const beforeWall = wall(3);
  const wallInstance = [{
    spellId: "xanathar-muro-di-luce",
    instanceId: "wall-light-1",
    casterId: "caster",
  }];
  const concentration = {
    "wall-light-1": {
      spellId: "xanathar-muro-di-luce",
      instanceId: "wall-light-1",
    },
  };
  const entry = {
    id: "wall-final-beam",
    effectsMutation: {
      changes: [
        {
          id: "caster",
          fields: { spells: true, concentrations: true },
          before: { spells: wallInstance, concentrations: concentration },
          after: { spells: [], concentrations: {} },
        },
        {
          id: "target",
          fields: {},
          before: {},
          after: {},
          metadataFields: { hp: true },
          beforeMetadata: { hp: snapshot(20) },
          afterMetadata: { hp: snapshot(9) },
        },
      ],
      sideEffects: [{ id: "wall-root", before: beforeWall, after: null }],
    },
  };

  const plan = buildCoordinatedEffectsUndoPlan({
    currentStates: [
      {
        id: "caster",
        conditions: [],
        spells: [],
        concentrations: {},
        metadata: {},
      },
      targetState(9),
    ],
    sceneItems: [],
    entryOrEntries: [entry],
    metadataKeys: {
      conditions: "conditions",
      spells: "plugin/spells",
      concentrations: "plugin/concentration",
    },
  });

  assert.equal(plan.status, undefined);
  const casterChange = plan.changes.find((change) => change.id === "caster");
  const targetChange = plan.changes.find((change) => change.id === "target");
  assert.deepEqual(casterChange.after.spells, wallInstance);
  assert.deepEqual(casterChange.after.concentrations, concentration);
  assert.deepEqual(targetChange.afterMetadata.hp, snapshot(20));
  assert.equal(plan.undoSideEffects.length, 1);
  assert.equal(plan.undoSideEffects[0].expected, null);
  assert.deepEqual(plan.undoSideEffects[0].restore, beforeWall);
});

test("il raggio di Muro di Luce committa danno e geometria nello stesso Effects Mutation", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/spellApplicationExecutor.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function executeSpellActiveResolution");
  const end = source.indexOf("export async function executeSpellBoardTokenStateUpdate", start);
  const block = source.slice(start, end);

  assert.match(block, /planWallOfLightShortening/);
  assert.match(block, /type: "static-zone:reorient"/);
  assert.match(block, /type: "static-zone:remove-ended"/);
  assert.equal((block.match(/runEffectsMutation\(operations/g) || []).length, 1);
});


test("Undo reorient del muro tollera metadata runtime aggiornati dopo lo sparo", () => {
  const before = {
    id: "wall-root",
    position: { x: 10, y: 20 },
    commands: [{ command: "old" }],
    metadata: {
      "plugin/aoeArea": { start: { x: 0, y: 0 }, end: { x: 18, y: 0 } },
      "plugin/spellZone": { triggerRuntime: { pending: [] }, stable: true },
    },
  };
  const afterAtCommit = {
    ...before,
    position: { x: 0, y: 0 },
    commands: [{ command: "short" }],
    metadata: {
      ...before.metadata,
      "plugin/aoeArea": { start: { x: 0, y: 0 }, end: { x: 15, y: 0 } },
    },
  };
  const current = {
    ...afterAtCommit,
    metadata: {
      ...afterAtCommit.metadata,
      // Aggiornamento indipendente del runtime zona: non deve invalidare Undo.
      "plugin/spellZone": { triggerRuntime: { pending: [{ id: "later" }] }, stable: true },
    },
  };
  const entry = {
    id: "wall-beam-reorient",
    effectsMutation: {
      changes: [],
      sideEffects: [{
        id: "wall-root",
        type: "static-zone-reorient",
        beforePosition: before.position,
        afterPosition: afterAtCommit.position,
        beforeCommands: before.commands,
        afterCommands: afterAtCommit.commands,
        metadataChanges: [{
          metadataKey: "plugin/aoeArea",
          before: { present: true, value: before.metadata["plugin/aoeArea"] },
          after: { present: true, value: afterAtCommit.metadata["plugin/aoeArea"] },
        }],
      }],
    },
  };

  const plan = buildHistoryUndoPlan({
    sceneItems: [current],
    entryOrEntries: [entry],
    metadataKey: "plugin/meta",
  });

  assert.equal(plan.status, undefined);
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].commands, true);
  assert.deepEqual(plan.changes[0].beforeCommands, afterAtCommit.commands);
  assert.deepEqual(plan.changes[0].afterCommands, before.commands);
  assert.deepEqual(plan.changes[0].externalMetadata[0].after.value, before.metadata["plugin/aoeArea"]);
  assert.deepEqual(plan.initialItems[0].item.metadata["plugin/spellZone"].triggerRuntime.pending, [{ id: "later" }]);
});

test("static-zone:reorient registra un side effect granulare e non uno snapshot item completo", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/effectsMutations.js", import.meta.url), "utf8");
  const start = source.indexOf('if (sideEffect.type === "static-zone:reorient")');
  const block = source.slice(start, source.indexOf('if (sideEffect.type === "static-zone:set-rule-choice")', start));
  assert.match(block, /type:\s*"static-zone-reorient"/);
  assert.match(block, /beforeCommands/);
  assert.match(block, /metadataChanges/);
});
