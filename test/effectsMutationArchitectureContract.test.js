import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const effects = read("../src/effectsMutations.js");
const conditions = read("../src/conditions.js");
const classRuntime = read("../src/classFeatureRuntime.js");
const initiativeCards = read("../src/initiativeCards.js");
const quickHp = read("../src/quick-hp-modal.js");

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `marker iniziale assente: ${start}`);
  assert.ok(to > from, `marker finale assente: ${end}`);
  return source.slice(from, to);
}

test("il coordinator persistente viene creato soltanto dal mount background", () => {
  assert.match(effects, /let effectsMutationCoordinator = null;/);
  assert.equal(
    (effects.match(/createBackgroundEffectsMutationCoordinator\(\)/g) || []).length,
    2,
  );
  const mount = section(
    effects,
    "export async function mountEffectsMutationCoordinatorService()",
    "export function unmountEffectsMutationCoordinatorService()",
  );
  assert.match(mount, /effectsMutationCoordinator = createBackgroundEffectsMutationCoordinator\(\)/);
  assert.doesNotMatch(effects, /runEffectsMutation\(async\s*\(/);
  assert.doesNotMatch(effects, /typeof command\.operations === "function"\s*\?\s*await/);
});

test("le API persistenti conditions delegano alla lane e non scrivono metadata effects", () => {
  const writers = section(
    conditions,
    "export async function setItemConditions",
    "// Payload Slate minimale",
  );
  assert.match(writers, /__runCoordinatedConditionMutation/g);
  assert.doesNotMatch(writers, /OBR\.scene\.items\.updateItems/);
  assert.doesNotMatch(writers, /meta\.conditions\s*=/);
});

test("initiativeCards e classFeatureRuntime non conservano writer conditions fuori lane", () => {
  const cardWriters = section(
    initiativeCards,
    "async function writeTokenProfile",
    "export function getInitiativeCard",
  );
  assert.match(cardWriters, /runEffectsMutation/);
  assert.doesNotMatch(cardWriters, /OBR\.scene\.items\.updateItems/);

  const reconciliation = section(
    classRuntime,
    "export async function reconcileClassFeatureActivationsAfterConditionRemoval",
    "export async function adjustClassFeatureResource",
  );
  assert.doesNotMatch(reconciliation, /OBR\.scene\.items\.updateItems/);
  assert.match(reconciliation, /return returnDetails \? \{ changed: ids, details \} : ids/);

  const prepare = section(
    effects,
    "export async function prepareEffectsMutation",
    "async function commitEffectsMutationPlan",
  );
  const commit = section(
    effects,
    "async function commitEffectsMutationPlan",
    "const BACKGROUND_TRANSPORT_TIMEOUT_MS",
  );
  assert.match(prepare, /mergeClassFeatureReconciliation\(plan/);
  assert.doesNotMatch(commit, /reconcileClassFeatureActivationsAfterConditionRemoval/);
  assert.equal((commit.match(/OBR\.scene\.items\.updateItems/g) || []).length, 1);
});

test("i side effect persistenti iniziano soltanto dopo il commit canonico", () => {
  const commit = section(
    effects,
    "async function commitCoordinatedEffectsPlan",
    "let effectsMutationCoordinator = null",
  );
  assert.ok(
    commit.indexOf("commitEffectsMutationPlan(plan")
      < commit.indexOf("runPostCommitSideEffects(sideEffects"),
  );
});

test("la transazione composita Quick HP produce una sola entry effectsMutation", () => {
  const apply = section(
    quickHp,
    "async function applyOperation()",
    "async function undoLastOperation()",
  );
  assert.match(apply, /decorateEntry: \(entry\) => quickHpEffectsHistoryEntry/);
  assert.match(apply, /const coordinatedOperations = \[/);
  assert.match(apply, /type: "condition:reconcile-zero-hp"/);
  assert.equal((apply.match(/runEffectsMutation\(coordinatedOperations/g) || []).length, 1);
  assert.match(apply, /history: false/);
});
