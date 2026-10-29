import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Lot L9 of the bugfix pass (EF-03): the table screen keeps the highest revision of the GM's selection it saw. A GM
// who reloads OBR counts again from 1, and every new selection was ignored: the table screen stayed on the old one.
const source = readFileSync(new URL("../src/effectsReconciler.js", import.meta.url), "utf8");
const slice = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

function selectionRuntime(role, instanceId, sent, sceneItems = []) {
  return new Function("sent", "sceneItems", `
    const EFFECTS_SELECTION_INSTANCE_ID = ${JSON.stringify(instanceId)};
    const EFFECTS_SELECTION_CHANNEL = "selection";
    let mounted = true, writer = true, effectsRole = ${JSON.stringify(role)};
    let expandedTargetIds = new Set(), effectsDisplayMode = "selected";
    let remoteGMSelectionActive = false, remoteGMSelectionRevision = 0, remoteGMSelectionSource = "", gmSelectionRevision = 0;
    const OBR = {
      broadcast: { sendMessage: async (_channel, payload) => { sent.push(payload); } },
      scene: { items: { getItems: async (ids) => sceneItems.filter((item) => ids.includes(item.id)) } },
    };
    function configureEffectsDisplayProjection() {}
    function requestSelectionReconcile() {}
    ${slice("function normalizeSelection(selection) {", "function selectionRequestId() {")}
    ${slice("async function withoutHiddenTokens(selection) {", "function requestGMSelection() {")}
    ${slice("function handleEffectsSelectionMessage(event) {", "function normalizeEffectsDisplayMode(mode) {")}
    ${slice("function applyPlayerSelection(selection) {", "async function syncPlayerSelection(selection) {")}
    return { publish: publishGMSelection, handle: handleEffectsSelectionMessage, expanded: () => [...expandedTargetIds] };
  `)(sent, sceneItems);
}

test("L9: lo schermo del tavolo segue di nuovo la selezione del GM dopo che il GM ricarica OBR", async () => {
  const table = selectionRuntime("PLAYER", "table-screen", []);
  const gmPage = (instanceId) => {
    const sent = [];
    const runtime = selectionRuntime("GM", instanceId, sent);
    return async (selection) => {
      await runtime.publish(selection);
      table.handle({ data: sent.at(-1) });
    };
  };
  const firstPage = gmPage("gm-page-1");
  for (const selection of [["orc"], ["orc", "ogre"], ["ogre"], [], ["wizard"]]) await firstPage(selection);
  assert.deepEqual(table.expanded(), ["wizard"]);

  const reloadedPage = gmPage("gm-page-2");
  await reloadedPage(["goblin"]);
  assert.deepEqual(table.expanded(), ["goblin"], "the reloaded GM's first selection is followed");
  await reloadedPage(["goblin", "dragon"]);
  assert.deepEqual(table.expanded().sort(), ["dragon", "goblin"]);
});

test("L9: dalla stessa pagina del GM una selezione più vecchia arrivata dopo resta ignorata", async () => {
  const table = selectionRuntime("PLAYER", "table-screen", []);
  table.handle({ data: { type: "gm-selection", selection: ["new"], revision: 5, sourceInstanceId: "gm" } });
  table.handle({ data: { type: "gm-selection", selection: ["old"], revision: 4, sourceInstanceId: "gm" } });
  assert.deepEqual(table.expanded(), ["new"]);
});

test("L16: i token che il GM tiene nascosti non arrivano nella selezione mandata al tavolo", async () => {
  const sent = [];
  const gm = selectionRuntime("GM", "gm-page", sent, [
    { id: "orc", visible: true },
    { id: "lurker", visible: false },
  ]);
  await gm.publish(["orc", "lurker", "note"]);
  assert.deepEqual(sent.at(-1).selection, ["orc", "note"]);
  await gm.publish(["lurker"]);
  assert.deepEqual(sent.at(-1).selection, [], "only a hidden token selected: the table expands nothing");
  assert.equal(sent.at(-1).revision, 2);
});
