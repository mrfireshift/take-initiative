import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  QUICK_CONDITION_LIST,
  isQuickCondition,
  quickConditionMenuEntries,
  quickConditionState,
  quickConditionToggleTargets,
} from "../src/quickConditionsCore.js";
import { isAllowedInitiativeCardMenuAction } from "../src/menuPopoverProtocolCore.js";
import {
  buildInitiativeCardContextMenuPayload,
  routeInitiativeCardContextMenuAction,
} from "../src/initiativeMenuActionsCore.js";

const conditionsSource = readFileSync(new URL("../src/conditions.js", import.meta.url), "utf8");
const trackerSource = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");

test("le condizioni rapide sono le tredici applicabili tranne Pietrificato", () => {
  assert.equal(QUICK_CONDITION_LIST.length, 13);
  for (const name of ["Pietrificato", "Ira", "Indebolimento"]) assert.equal(isQuickCondition(name), false, name);
  // Every quick condition is in the catalogue of conditions.js.
  const catalogue = conditionsSource.slice(conditionsSource.indexOf("export const CONDITION_LIST = ["), conditionsSource.indexOf("];"));
  for (const name of QUICK_CONDITION_LIST) assert.ok(catalogue.includes(`"${name}"`), name);
  // Ira is the Barbarian's class feature: kept in the catalogue, no longer offered as a condition to apply.
  assert.ok(conditionsSource.includes('const NON_APPLICABLE_CONDITIONS = new Set([EXHAUSTION_CONDITION, "Ira"]);'));
  assert.ok(conditionsSource.includes("(name) => !NON_APPLICABLE_CONDITIONS.has(name)"));
});

test("lo stato di una condizione rapida: attiva su tutti, su alcuni o su nessuno", () => {
  const scope = [
    { id: "g1", conditions: ["Prono", "Avvelenato"] },
    { id: "g2", conditions: ["prono"] },
    { id: "g3", conditions: [] },
  ];
  assert.equal(quickConditionState(scope.slice(0, 2), "Prono"), "on");
  assert.equal(quickConditionState(scope, "Prono"), "mixed");
  assert.equal(quickConditionState(scope, "Stordito"), "off");
  assert.equal(quickConditionState([], "Prono"), "off");
  const entries = quickConditionMenuEntries(scope, { Prono: "⬇️" });
  assert.equal(entries.length, 13);
  assert.deepEqual(entries.find((entry) => entry.name === "Prono"), { name: "Prono", emoji: "⬇️", state: "mixed" });
});

test("un clic toglie la condizione a tutti se tutti l'hanno, altrimenti la aggiunge solo a chi non l'ha", () => {
  assert.deepEqual(quickConditionToggleTargets([{ id: "a", conditions: ["Prono"] }], "Prono"), { mode: "remove", targetIds: ["a"] });
  assert.deepEqual(quickConditionToggleTargets([{ id: "a", conditions: [] }], "Prono"), { mode: "add", targetIds: ["a"] });
  assert.deepEqual(quickConditionToggleTargets([
    { id: "a", conditions: ["Prono"] },
    { id: "b", conditions: [] },
    { id: "c", conditions: ["Accecato"] },
  ], "Prono"), { mode: "add", targetIds: ["b", "c"] });
});

test("il menu della card accetta toggle-condition solo con una condizione rapida e lo passa al tracker", async () => {
  assert.equal(isAllowedInitiativeCardMenuAction("toggle-condition", "Prono"), true);
  assert.equal(isAllowedInitiativeCardMenuAction("toggle-condition", "Pietrificato"), false);
  assert.equal(isAllowedInitiativeCardMenuAction("toggle-condition", "Ira"), false);
  assert.equal(isAllowedInitiativeCardMenuAction("toggle-condition", ""), false);

  const calls = [];
  const handled = await routeInitiativeCardContextMenuAction(
    { sourceEntry: { id: "g1" }, scopeIds: ["g1", "g2"] },
    { action: "toggle-condition", value: "Prono" },
    { toggleQuickCondition: (...args) => calls.push(args) },
  );
  assert.equal(handled, true);
  assert.deepEqual(calls, [[["g1", "g2"], "Prono"]]);

  const quickConditions = quickConditionMenuEntries([{ id: "g1", conditions: ["Prono"] }]);
  const payload = buildInitiativeCardContextMenuPayload({ sourceEntry: { id: "g1", name: "Goblin" }, scopeIds: ["g1"], quickConditions });
  assert.deepEqual(payload.quickConditions, quickConditions);
  assert.equal(buildInitiativeCardContextMenuPayload({ sourceEntry: { id: "g1" }, scopeIds: ["g1"] }).quickConditions, undefined);
});

test("il tracker applica le condizioni rapide con l'operazione del pannello, la cronologia e le etichette", () => {
  const handler = trackerSource.slice(
    trackerSource.indexOf("async function __toggleCardQuickCondition("),
    trackerSource.indexOf("async function __clearCardSpells("),
  );
  assert.ok(handler.includes("quickConditionToggleTargets("));
  assert.ok(handler.includes('mode: plan.mode === "remove" ? "toggle" : "add",'));
  assert.ok(handler.includes("runEffectsMutation(conditionMutationOperations({"));
  assert.ok(handler.includes('history: { kind: "condition", label },'));
  assert.ok(handler.includes("await refreshConditionLabels(plan.targetIds);"));
  assert.ok(trackerSource.includes("toggleQuickCondition: (ids, conditionName) => __toggleCardQuickCondition(ids, conditionName, sceneEpoch),"));
  assert.ok(trackerSource.includes("quickConditions: quickConditionMenuEntries(conditionScope, CONDITION_EMOJI),"));
});

test("le condizioni rapide stanno nel sottomenu Condizioni, con il pannello completo in fondo", () => {
  const menuSource = readFileSync(new URL("../src/initiative-card-context-menu.js", import.meta.url), "utf8");
  const render = menuSource.slice(menuSource.indexOf("function render(payload)"));
  assert.ok(render.includes('addSubmenu(root, "Condizioni", "conditions-panel.svg", [], {'));
  const submenu = render.slice(render.indexOf("buildContent: (content) => {"), render.indexOf("} else {"));
  assert.ok(submenu.indexOf("addQuickConditions(content, quickConditions);") < submenu.indexOf('makeAction(content, "Tutte le condizioni…"'));
  assert.ok(!render.includes("addQuickConditions(root"), "not inline at the top of the menu");
});
