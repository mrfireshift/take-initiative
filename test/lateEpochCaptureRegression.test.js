import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");

function sourceSectionIn(sourceText, startMarker, endMarker) {
  const start = sourceText.indexOf(startMarker);
  const end = sourceText.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `marker iniziale assente: ${startMarker}`);
  assert.ok(end > start, `marker finale assente: ${endMarker}`);
  return sourceText.slice(start, end);
}

function sourceSection(startMarker, endMarker) {
  return sourceSectionIn(source, startMarker, endMarker);
}

function assertOrdered(section, markers) {
  let previous = -1;
  for (const marker of markers) {
    const searchFrom = previous >= 0 ? previous + 1 : 0;
    const position = section.indexOf(marker, searchFrom);
    assert.ok(position >= 0, `contratto assente: ${marker}`);
    assert.ok(position > previous, `ordine del contratto cambiato: ${marker}`);
    previous = position;
  }
}

test("1. Clear Initiative: cattura epoch all'ingresso, usa guard prima/dopo await e resetTrackerState(sceneEpoch)", () => {
  const section = sourceSection(
    "function makeClearInitiativeBtn()",
    "function makeHistoryBtn()"
  );

  assertOrdered(section, [
    "const sceneEpoch = currentSceneEpoch();",
    'if (!__isCurrentSceneOperation(sceneEpoch, "clear-initiative")) return;',
    "const items = await OBR.scene.items.getItems(",
    'if (!__isCurrentSceneOperation(sceneEpoch, "clear-initiative")) return;',
    "await OBR.scene.items.updateItems(",
    'if (!__isCurrentSceneOperation(sceneEpoch, "clear-initiative")) return;',
    "await resetTrackerState(sceneEpoch);",
    'if (!__isCurrentSceneOperation(sceneEpoch, "clear-initiative")) return;',
    "await renderAll();",
  ]);
});

test("2. Add All: cattura epoch all'ingresso e la propaga a reconcile, enforceUniqueNamePrefixes e fill mode", () => {
  const section = sourceSection(
    "function makeAddAllInitiativeBtn()",
    "function makeOptionsBtn()"
  );

  assertOrdered(section, [
    "const sceneEpoch = currentSceneEpoch();",
    'if (!__isCurrentSceneOperation(sceneEpoch, "add-all-initiative")) return;',
    "await finishInitiativeFillMode(sceneEpoch);",
    "const items = await OBR.scene.items.getItems(",
    "const registry = knownFactionAssignmentEnabled",
    "await OBR.scene.items.updateItems(",
    "await reconcileStateWithItems(sceneEpoch);",
    "await enforceUniqueNamePrefixes(sceneEpoch);",
    "await renderAll();",
    "await startInitiativeFillMode({ silent: true, sceneEpoch });",
  ]);
});

test("3. DnD Reorder: setSceneState riceve la captured epoch e valida lo stato prima della scrittura", () => {
  const section = sourceSection(
    "// --- DnD helper: sposta sourceId prima/dopo targetId ma SOLO fra pari iniziativa",
    "function __renderOptimisticNavigationState("
  );

  assertOrdered(section, [
    "async function _reorderWithinSameInitiative(sourceId, targetId, placeBefore, sceneEpoch = currentSceneEpoch())",
    'if (!__isCurrentSceneOperation(sceneEpoch, "reorder-same-init")) return;',
    "await Promise.all([getSceneState(), readEntries()]);",
    'if (!__isCurrentSceneOperation(sceneEpoch, "reorder-same-init")) return;',
    "await setSceneState(prev => ({",
    "}), sceneEpoch);",
    "async function _reorderBlockWithinSameInitiative(sourceIds, targetId, placeBefore, sceneEpoch = currentSceneEpoch())",
    'if (!__isCurrentSceneOperation(sceneEpoch, "reorder-block-same-init")) return;',
    "await Promise.all([getSceneState(), readEntries()]);",
    'if (!__isCurrentSceneOperation(sceneEpoch, "reorder-block-same-init")) return;',
    "await setSceneState(prev => ({",
    "}), sceneEpoch);",
    "async function _reorderCollapsedGroupWithinSameInitiative(sourceLeadId, targetId, placeBefore, sceneEpoch = currentSceneEpoch())",
    "await _reorderBlockWithinSameInitiative(ids, targetId, placeBefore, sceneEpoch);",
  ]);
});

test("4. Inline Editor: saveValue e afterCommit condividono la STESSA editorSessionEpoch catturata a beginEdit", () => {
  const section = sourceSection(
    "function bindInitiativeEditorForEntry(badge, entry)",
    "function bindHPEditorForEntry("
  );

  assertOrdered(section, [
    "let editorSessionEpoch = null;",
    "beginEdit: async () => {",
    "editorSessionEpoch = currentSceneEpoch();",
    "saveValue: async (normalized) => {",
    "const sceneEpoch = editorSessionEpoch ?? currentSceneEpoch();",
    "await updateInitiative(entry.id, normalized, sceneEpoch);",
    "trySeedGroupInitiative(",
    "afterCommit: async () => {",
    "const sceneEpoch = editorSessionEpoch ?? currentSceneEpoch();",
    "await reconcileStateWithItems(sceneEpoch);",
    "afterCancel: async (options = {}) => {",
    "finishFillMode: (sceneEpoch = editorSessionEpoch ?? currentSceneEpoch()) =>",
    "openFillNeighbor: (goPrev) => {",
    "commitAndOpenNeighbor: async ({ goPrev, commit }) => {",
  ]);

  // Verifica che NON ci siano catture indipendenti const sceneEpoch = currentSceneEpoch() dentro saveValue o afterCommit
  const saveValueIndex = section.indexOf("saveValue: async");
  const saveValueBlock = section.slice(saveValueIndex, section.indexOf("afterCommit: async", saveValueIndex));
  assert.equal(
    saveValueBlock.includes("const sceneEpoch = currentSceneEpoch();"),
    false,
    "saveValue non deve ricatturare currentSceneEpoch() indipendentemente"
  );

  const afterCommitIndex = section.indexOf("afterCommit: async");
  const afterCommitBlock = section.slice(afterCommitIndex, section.indexOf("afterCancel: async", afterCommitIndex));
  assert.equal(
    afterCommitBlock.includes("const sceneEpoch = currentSceneEpoch();"),
    false,
    "afterCommit non deve ricatturare currentSceneEpoch() indipendentemente"
  );
});

test("5. Context Menu: memorizza sceneEpoch all'apertura nel context e il listener usa context.sceneEpoch", () => {
  const openSection = sourceSection(
    "function __openInitiativeCardContextMenu(sourceEntry, event)",
    "function __bindInitiativeCardContextMenu("
  );

  assertOrdered(openSection, [
    "const sceneEpoch = currentSceneEpoch();",
    'if (!__isCurrentSceneOperation(sceneEpoch, "card-context-menu-open")) return;',
    "__initiativeCardContextMenuContext = { sourceEntry, scopeIds, sceneEpoch };",
    "const placementPromise = __getInitiativeCardContextMenuPlacement(event);",
    'if (!__isCurrentSceneOperation(sceneEpoch, "card-context-menu-open")) return;',
    "await OBR.popover.open({",
    'if (!__isCurrentSceneOperation(sceneEpoch, "card-context-menu-open")) {',
    "await __closeInitiativeCardContextMenu();",
    "return;",
    "}",
    "__initiativeCardContextMenu = true;",
  ]);

  const listenerSection = sourceSection(
    "function mountInitiativeCardContextMenuListener()",
    "function mountTrackerQuickActionsPopoverListener()"
  );

  assertOrdered(listenerSection, [
    "const context = __initiativeCardContextMenuContext;",
    "const sceneEpoch = context.sceneEpoch;",
    'if (!__isCurrentSceneOperation(sceneEpoch, "card-context-menu-action")) {',
    "__closeInitiativeCardContextMenu();",
    "return;",
    "__handleInitiativeCardContextMenuAction(context, data, sceneEpoch)",
  ]);

  assert.equal(
    listenerSection.includes("const sceneEpoch = currentSceneEpoch();"),
    false,
    "Il broadcast listener non deve usare late capture ma context.sceneEpoch"
  );
});

test("6. Effects Semantics: condizioni, spell e concentrazione preservano runEffectsMutation e i sideEffects originali", () => {
  const conditionsSection = sourceSection(
    "async function __clearCardConditions(ids, sceneEpoch = currentSceneEpoch())",
    "async function __clearCardSpells(ids, sceneEpoch = currentSceneEpoch())"
  );
  assertOrdered(conditionsSection, [
    "await __selectContextScope(scopeIds, sceneEpoch);",
    "const mutation = await runEffectsMutation([{",
    'type: "condition:clear"',
    "targetIds: scopeIds",
    "sceneEpoch",
    "requireAppliedEffectsMutation(mutation);",
    "await refreshConditionLabels(scopeIds);",
  ]);

  const spellsSection = sourceSection(
    "async function __clearCardSpells(ids, sceneEpoch = currentSceneEpoch())",
    "async function __clearCardConcentrations(ids, sourceEntry = null, sceneEpoch = currentSceneEpoch())"
  );
  assertOrdered(spellsSection, [
    "await __selectContextScope(scopeIds, sceneEpoch);",
    "const mutation = await runEffectsMutation([{",
    'type: "spell:clear-non-concentration"',
    "targetIds: scopeIds",
    'type: "static-zone:remove-ended"',
    "sceneEpoch",
    "requireAppliedEffectsMutation(mutation);",
    "await refreshConditionLabels(scopeIds);",
  ]);

  const concentrationSection = sourceSection(
    "async function __clearCardConcentrations(ids, sourceEntry = null, sceneEpoch = currentSceneEpoch())",
    "async function __removeConditionOnTrackerCard(itemId, group)"
  );
  assertOrdered(concentrationSection, [
    "__selectionIdsForEntry(sourceEntry)",
    "await __selectContextScope(scopeIds, sceneEpoch);",
    "const mutation = await runEffectsMutation([{",
    'type: "concentration:break"',
    "casterIds: scopeIds",
    'type: "static-zone:remove-ended"',
    "sceneEpoch",
    "requireAppliedEffectsMutation(mutation);",
    "if (!mutation.changedIds.length) return;",
    "await refreshConditionLabels(historyIds);",
  ]);
});

test("7. Class Feature Routing: conserva le firme originali delle callback nel context menu", () => {
  const section = sourceSection(
    "async function __handleInitiativeCardContextMenuAction(context, data, sceneEpoch = currentSceneEpoch())",
    "function mountInitiativeCardContextMenuListener()"
  );

  assertOrdered(section, [
    "activateClassFeature: __activateClassFeatureFromContext,",
    "deactivateClassFeature: __deactivateClassFeatureFromContext,",
    "resetClassFeatureResources: __resetClassFeatureResourcesFromContext,",
  ]);

  assert.doesNotMatch(
    section,
    /activateClassFeature:\s*\([^)]*\)\s*=>/,
    "activateClassFeature non deve essere avvolto in wrapper che perdono argomenti"
  );
});

test("8. Fill Lifecycle: stale guard precede le mutazioni di stato locale e interrupt gestisce l'epoch dell'evento", () => {
  const finishSection = sourceSection(
    "async function finishInitiativeFillMode(sceneEpoch = currentSceneEpoch())",
    "async function startInitiativeFillMode(options = {})"
  );
  assertOrdered(finishSection, [
    "if (!__initiativeFillMode) return;",
    'if (!__isCurrentSceneOperation(sceneEpoch, "finish-initiative-fill")) return;',
    "__initiativeFillMode = false;",
    "__initiativeFillSession = null;",
    "__suspendRenders = false;",
    "await reconcileStateWithItems(sceneEpoch);",
    'await renderAll("initiative-fill-complete");',
  ]);

  const interruptSection = sourceSection(
    "async function interruptInitiativeFillForRemovedActor(event)",
    "function sceneItemEventAddsInitiative(event)"
  );
  assertOrdered(interruptSection, [
    "if (!__initiativeFillMode) return false;",
    "const sceneEpoch = event?.sceneEpoch ?? currentSceneEpoch();",
    'if (!__isCurrentSceneOperation(sceneEpoch, "interrupt-fill")) return false;',
    "await openInit.__commitFn();",
    'if (!__isCurrentSceneOperation(sceneEpoch, "interrupt-fill")) return false;',
    "__initiativeFillMode = false;",
    "__initiativeFillSession = null;",
    "__suspendRenders = false;",
  ]);
});

test("9. Lair toggle e setParagonActions: propagazione epoch e guard contro continuazioni su scene nuove", () => {
  const lairSection = sourceSection(
    "lairChk.addEventListener(\"change\", async (e) => {",
    "zoomChk.addEventListener(\"change\", async (e) => {"
  );
  assertOrdered(lairSection, [
    "const sceneEpoch = currentSceneEpoch();",
    'if (!__isCurrentSceneOperation(sceneEpoch, "lair-toggle")) return;',
    "await setSceneState(prev => ({ ...(prev || {}), lairEnabled: enabled }), sceneEpoch);",
    'if (!__isCurrentSceneOperation(sceneEpoch, "lair-toggle")) return;',
    "await reconcileStateWithItems(sceneEpoch);",
    'if (!__isCurrentSceneOperation(sceneEpoch, "lair-toggle")) return;',
    "await renderAll();",
  ]);

  const paragonSection = sourceSection(
    "async function setParagonActions(baseId, nextActions, sceneEpoch = currentSceneEpoch())",
    "async function setLegendaryCurrent(itemId, nextCurrent)"
  );
  assertOrdered(paragonSection, [
    'if (!__isCurrentSceneOperation(sceneEpoch, "set-paragon-actions")) return;',
    "await OBR.scene.items.updateItems([baseId], (items) => {",
    'if (!__isCurrentSceneOperation(sceneEpoch, "set-paragon-actions")) return;',
    "const baseEntries = await readEntries();",
    'if (!__isCurrentSceneOperation(sceneEpoch, "set-paragon-actions")) return;',
    "await setSceneState(prev => {",
    "}, sceneEpoch);",
  ]);
});

test("10. Tracker Quick Actions: cattura epoch all'apertura, la memorizza nel context, il listener la usa senza late capture e chiude se stale", () => {
  const toggleSection = sourceSection(
    "function __toggleTrackerQuickActionsPopover(sourceEntry, button, event)",
    "function __openInitiativeCardContextMenu("
  );

  assertOrdered(toggleSection, [
    "const sceneEpoch = currentSceneEpoch();",
    'if (!__isCurrentSceneOperation(sceneEpoch, "tracker-quick-actions-open")) return;',
    "__trackerQuickActionsContext = { sourceEntry, sceneEpoch };",
    "const placementPromise = __getInitiativeCardContextMenuPlacement(event);",
    'if (!__isCurrentSceneOperation(sceneEpoch, "tracker-quick-actions-open")) return;',
    "await OBR.popover.open({",
    'if (!__isCurrentSceneOperation(sceneEpoch, "tracker-quick-actions-open")) {',
    "await __closeTrackerQuickActionsPopover();",
    "return;",
    "__trackerQuickActionsPopover = true;",
  ]);

  const listenerSection = sourceSection(
    "function mountTrackerQuickActionsPopoverListener()",
    "function __disabledTrackerQuickActionIds("
  );

  assertOrdered(listenerSection, [
    "const context = __trackerQuickActionsContext;",
    "const sceneEpoch = context.sceneEpoch;",
    'if (!__isCurrentSceneOperation(sceneEpoch, "tracker-quick-actions-action")) {',
    "__closeTrackerQuickActionsPopover();",
    "return;",
    'if (!__isCurrentSceneOperation(sceneEpoch, "tracker-quick-actions-action")) return;',
    "void __runTrackerQuickAction(sourceEntry, action)",
  ]);

  assert.equal(
    listenerSection.includes("const sceneEpoch = currentSceneEpoch();"),
    false,
    "mountTrackerQuickActionsPopoverListener non deve fare una nuova currentSceneEpoch() come ownership"
  );
});

test("11. Post-open cleanup: Card Context Menu e Tracker Quick Actions chiudono il popover se l'epoch diventa stale durante OBR.popover.open", () => {
  const cardMenuSection = sourceSection(
    "function __openInitiativeCardContextMenu(sourceEntry, event)",
    "function __bindInitiativeCardContextMenu("
  );

  assertOrdered(cardMenuSection, [
    "await OBR.popover.open({",
    'if (!__isCurrentSceneOperation(sceneEpoch, "card-context-menu-open")) {',
    "await __closeInitiativeCardContextMenu();",
    "return;",
    "}",
    "__initiativeCardContextMenu = true;",
  ]);

  const quickActionsSection = sourceSection(
    "function __toggleTrackerQuickActionsPopover(sourceEntry, button, event)",
    "function __openInitiativeCardContextMenu("
  );

  assertOrdered(quickActionsSection, [
    "await OBR.popover.open({",
    'if (!__isCurrentSceneOperation(sceneEpoch, "tracker-quick-actions-open")) {',
    "await __closeTrackerQuickActionsPopover();",
    "return;",
    "}",
    "__trackerQuickActionsPopover = true;",
  ]);
});

test("12. Runtime reset: __resetInitiativeSceneRuntime invalida drag state e chiude i popover scene-bound", () => {
  const resetSection = sourceSection(
    "function __resetInitiativeSceneRuntime(sceneEpoch, reason)",
    "async function __adoptInitiativeSceneBaseline("
  );

  assertOrdered(resetSection, [
    "__cancelSceneEditorsWithoutCommit();",
    "__draggingId = null;",
    "__draggingInit = null;",
    "__draggingWasCollapsed = false;",
    "void __closeInitiativeCardContextMenu();",
    "void __closeTrackerQuickActionsPopover();",
    "__sceneBaselineEpoch = null;",
  ]);
});

test("13. Unique Declarations: __clearCardSpells e __clearCardConcentrations hanno una sola dichiarazione nel modulo", () => {
  const clearSpellsMatches = source.match(/async\s+function\s+__clearCardSpells\s*\(/g) || [];
  assert.equal(
    clearSpellsMatches.length,
    1,
    `__clearCardSpells deve avere esattamente 1 dichiarazione, trovate: ${clearSpellsMatches.length}`
  );

  const clearConcMatches = source.match(/async\s+function\s+__clearCardConcentrations\s*\(/g) || [];
  assert.equal(
    clearConcMatches.length,
    1,
    `__clearCardConcentrations deve avere esattamente 1 dichiarazione, trovate: ${clearConcMatches.length}`
  );
});

test("14. Canonical Signatures: __clearCardSpells e __clearCardConcentrations hanno firme uniche ed epoch-aware", () => {
  assert.match(
    source,
    /async\s+function\s+__clearCardSpells\s*\(\s*ids\s*,\s*sceneEpoch\s*=\s*currentSceneEpoch\(\)\s*\)/,
    "__clearCardSpells deve avere la firma canonica (ids, sceneEpoch = currentSceneEpoch())"
  );
  assert.match(
    source,
    /async\s+function\s+__clearCardConcentrations\s*\(\s*ids\s*,\s*sourceEntry\s*=\s*null\s*,\s*sceneEpoch\s*=\s*currentSceneEpoch\(\)\s*\)/,
    "__clearCardConcentrations deve avere la firma canonica (ids, sourceEntry = null, sceneEpoch = currentSceneEpoch())"
  );
});

test("15. Tracker Spell Termination: __terminateSpellOnTrackerCard cattura epoch e usa guard prima e dopo runEffectsMutation", () => {
  const section = sourceSection(
    "async function __terminateSpellOnTrackerCard(",
    "async function __terminateClassFeatureOnTrackerCard("
  );

  assertOrdered(section, [
    "sceneEpoch = currentSceneEpoch()",
    '!__isCurrentSceneOperation(sceneEpoch, "terminate-tracker-spell")',
    "const mutation = await runEffectsMutation(operations, {",
    "sceneEpoch,",
    'if (!__isCurrentSceneOperation(sceneEpoch, "terminate-tracker-spell")) return;',
    "requireAppliedEffectsMutation(mutation);",
    "await refreshConditionLabels([itemId]);",
  ]);
});

