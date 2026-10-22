import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLEARED_INITIATIVE_STATE_FIELDS,
  clearedInitiativeRestorePatch,
  clearedInitiativeSnapshot,
  roundResetRestorePatch,
} from "../src/initiativeUndoCore.js";

const state = {
  order: ["omar", "__EPIC__::auril::after::omar", "auril", "lavera"],
  current: 2,
  round: 5,
  seededGroups: { goblin: 12 },
  collapsed: { goblin: true },
  ui: { autoFocus: true },
};

test("Svuota salva i token e lo stato del turno, virtuali compresi", () => {
  const snapshot = clearedInitiativeSnapshot(state, ["omar", "auril", "lavera", "omar", ""]);
  assert.deepEqual(snapshot.itemIds, ["omar", "auril", "lavera"]);
  assert.deepEqual(snapshot.state, {
    order: ["omar", "__EPIC__::auril::after::omar", "auril", "lavera"],
    current: 2,
    round: 5,
    seededGroups: { goblin: 12 },
  });
  // A copy: later changes to the live state do not reach it.
  state.seededGroups.goblin = 3;
  assert.equal(snapshot.state.seededGroups.goblin, 12);
  state.seededGroups.goblin = 12;
  assert.deepEqual(CLEARED_INITIATIVE_STATE_FIELDS, ["order", "current", "round", "seededGroups"]);
  assert.equal(clearedInitiativeSnapshot({ order: [] }, []), null);
});

test("Annulla di Svuota riscrive lo stato solo se l'ordine è ancora vuoto", () => {
  const snapshot = clearedInitiativeSnapshot(state, ["omar", "auril", "lavera"]);
  const cleared = { order: [], current: 0, round: 1, seededGroups: {}, collapsed: { goblin: true }, ui: { autoFocus: false } };
  assert.deepEqual(clearedInitiativeRestorePatch(cleared, snapshot), {
    order: ["omar", "__EPIC__::auril::after::omar", "auril", "lavera"],
    current: 2,
    round: 5,
    seededGroups: { goblin: 12 },
    // The fields Svuota does not reset keep their current value.
    collapsed: { goblin: true },
    ui: { autoFocus: false },
  });
  assert.equal(clearedInitiativeRestorePatch({ ...cleared, order: ["brann"] }, snapshot), null);
  assert.equal(clearedInitiativeRestorePatch(cleared, null), null);
});

test("Annulla di Reset round rimette il round finché è ancora 1", () => {
  assert.deepEqual(roundResetRestorePatch({ round: 1, current: 2, order: ["a"] }, 5), { round: 5, current: 2, order: ["a"] });
  assert.equal(roundResetRestorePatch({ round: 2 }, 5), null);
  assert.equal(roundResetRestorePatch({ round: 1 }, 1), null);
});

test("il tracker ripristina prima lo stato e poi i token, e segna l'annullamento del reset come un passo indietro", () => {
  const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  const undoClear = source.slice(source.indexOf("async function __undoClearInitiative"));
  const stateWrite = undoClear.indexOf("await setSceneState(");
  const tokensWrite = undoClear.indexOf("await OBR.scene.items.updateItems(");
  assert.ok(stateWrite > 0 && tokensWrite > stateWrite);
  assert.match(undoClear, /inInitiative: true/);
  assert.match(undoClear, /\.\.\.\(it\.metadata\?\.\[META_KEY\] \|\| \{\}\)/);

  const undoReset = source.slice(source.indexOf("async function __undoRoundReset"), source.indexOf("async function __undoClearInitiative"));
  assert.match(undoReset, /direction: -1/);
  assert.match(undoReset, /__conditionNavigationHint = hint;/);

  assert.match(source, /onUndo: \(\) => __undoRoundReset\(previousRound, sceneEpoch\)/);
  assert.match(source, /onUndo: \(\) => __undoClearInitiative\(snapshot, sceneEpoch\)/);
});
