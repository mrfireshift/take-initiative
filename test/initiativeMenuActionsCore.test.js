import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInitiativeCardContextMenuPayload,
  deriveInitiativeCardBossMode,
  resolveCompactAdminMenuAction,
  routeInitiativeCardContextMenuAction,
} from "../src/initiativeMenuActionsCore.js";

test("il menu amministrativo risolve ogni azione sul controllo esistente", () => {
  assert.deepEqual(resolveCompactAdminMenuAction({
    type: "action",
    action: "reset-round",
  }), {
    action: "reset-round",
    selector: "[data-reset-round='1']",
  });
  assert.deepEqual(resolveCompactAdminMenuAction({
    type: "action",
    action: "history",
  }), {
    action: "history",
    selector: "[data-history='1']",
  });
  assert.deepEqual(resolveCompactAdminMenuAction({
    type: "action",
    action: "add-all",
  }), {
    action: "add-all",
    selector: "[data-add-all-initiative='1']",
  });
  assert.deepEqual(resolveCompactAdminMenuAction({
    type: "action",
    action: "fill-initiative",
  }), {
    action: "fill-initiative",
    selector: "[data-fill-initiative='1']",
  });
  assert.deepEqual(resolveCompactAdminMenuAction({
    type: "action",
    action: "factions",
  }), {
    action: "factions",
    selector: "[data-faction-configurator='1']",
  });
  assert.deepEqual(resolveCompactAdminMenuAction({
    type: "action",
    action: "clear-initiative",
  }), {
    action: "clear-initiative",
    selector: "[data-clear-initiative='1']",
  });
  assert.equal(resolveCompactAdminMenuAction({
    type: "close",
    action: "history",
  }), null);
  assert.equal(resolveCompactAdminMenuAction({
    type: "action",
    action: "unknown",
  }), null);
});

test("la modalità boss conserva la precedenza epic, paragon, legendary", () => {
  assert.equal(deriveInitiativeCardBossMode({
    isEpic: true,
    paragonActions: 3,
    legendary: { max: 3 },
  }), "epic");
  assert.equal(deriveInitiativeCardBossMode({
    paragonActions: 2,
    legendary: { max: 3 },
  }), "paragon");
  assert.equal(deriveInitiativeCardBossMode({
    legendary: { max: 3 },
  }), "legendary");
  assert.equal(deriveInitiativeCardBossMode({}), "none");
});

test("il payload card conserva titolo, scope e visibilità del menu", () => {
  assert.deepEqual(buildInitiativeCardContextMenuPayload({
    sourceEntry: {
      name: "Goblin",
      attitude: "enemy",
      legendary: { max: 3 },
    },
    scopeIds: ["goblin-1"],
    hasActiveConcentration: true,
  }), {
    title: "Goblin",
    isBulkScope: false,
    scopeCount: 1,
    expandedTokenMenu: true,
    hasActiveConcentration: true,
    attitude: "enemy",
    activeMode: "legendary",
    groupCollapsed: false,
    showInitiativeCard: false,
    showBossMenu: true,
  });

  assert.deepEqual(buildInitiativeCardContextMenuPayload({
    sourceEntry: {
      name: "Goblin 1",
      attitude: "pc",
      __groupCollapsed: true,
      __groupBase: "Goblin",
    },
    scopeIds: ["goblin-1", "goblin-2"],
  }), {
    title: "Goblin (2)",
    isBulkScope: true,
    scopeCount: 2,
    expandedTokenMenu: false,
    hasActiveConcentration: false,
    attitude: "pc",
    activeMode: "none",
    groupCollapsed: true,
    showInitiativeCard: false,
    showBossMenu: false,
  });
});

test("il routing conditions e spells seleziona lo scope prima del popup", async () => {
  const calls = [];
  const context = {
    sourceEntry: { id: "goblin-1" },
    scopeIds: ["goblin-1", "goblin-2"],
  };
  const handlers = {
    selectScope: async (ids) => calls.push(["select", ids]),
    openConditions: async (entry) => calls.push(["conditions", entry]),
    openSpells: async (entry) => calls.push(["spells", entry]),
  };

  assert.equal(await routeInitiativeCardContextMenuAction(
    context,
    { action: "conditions" },
    handlers,
  ), true);
  assert.deepEqual(calls, [
    ["select", context.scopeIds],
    ["conditions", context.sourceEntry],
  ]);

  calls.length = 0;
  assert.equal(await routeInitiativeCardContextMenuAction(
    context,
    { action: "spells" },
    handlers,
  ), true);
  assert.deepEqual(calls, [
    ["select", context.scopeIds],
    ["spells", context.sourceEntry],
  ]);
});

test("ogni azione card viene inoltrata alla callback corretta", async () => {
  const calls = [];
  const context = {
    sourceEntry: { id: "goblin-1" },
    scopeIds: ["goblin-1"],
  };
  const handlers = {
    clearConditions: async (...args) => calls.push(["clearConditions", ...args]),
    clearSpells: async (...args) => calls.push(["clearSpells", ...args]),
    clearConcentrations: async (...args) => calls.push(["clearConcentrations", ...args]),
    openInitiativeCard: async (...args) => calls.push(["openInitiativeCard", ...args]),
    setAttitude: async (...args) => calls.push(["setAttitude", ...args]),
    setBossMode: async (...args) => calls.push(["setBossMode", ...args]),
    removeFromInitiative: async (...args) => calls.push(["removeFromInitiative", ...args]),
    resetClassFeatureResources: async (...args) => calls.push(["resetClassFeatureResources", ...args]),
  };
  const cases = [
    ["clear-conditions", "", ["clearConditions", context.scopeIds]],
    ["clear-spells", "", ["clearSpells", context.scopeIds]],
    ["clear-concentration", "", [
      "clearConcentrations",
      context.scopeIds,
      context.sourceEntry,
    ]],
    ["initiative-card", "", ["openInitiativeCard", context.sourceEntry]],
    ["attitude", "ally", ["setAttitude", context.scopeIds, "ally"]],
    ["boss-mode", "epic", ["setBossMode", context.sourceEntry, "epic"]],
    ["remove", "", ["removeFromInitiative", context.scopeIds]],
    ["class-feature-reset-resources", "", ["resetClassFeatureResources", context.sourceEntry]],
  ];

  for (const [action, value, expected] of cases) {
    calls.length = 0;
    assert.equal(await routeInitiativeCardContextMenuAction(
      context,
      { action, value },
      handlers,
    ), true, action);
    assert.deepEqual(calls, [expected], action);
  }
});

test("azioni o valori non ammessi non raggiungono le callback", async () => {
  let calls = 0;
  const handlers = {
    setAttitude: async () => { calls += 1; },
    setBossMode: async () => { calls += 1; },
  };

  assert.equal(await routeInitiativeCardContextMenuAction(
    {},
    { action: "attitude", value: "hostile" },
    handlers,
  ), false);
  assert.equal(await routeInitiativeCardContextMenuAction(
    {},
    { action: "boss-mode", value: "mythic" },
    handlers,
  ), false);
  assert.equal(await routeInitiativeCardContextMenuAction(
    {},
    { action: "unknown" },
    handlers,
  ), false);
  assert.equal(calls, 0);
});

test("il payload e il routing del menu espongono attivazione e terminazione Feature", async () => {
  const sourceEntry = {
    name: "Paladino",
    attitude: "pc",
    classFeatures: [{
      featureId: "feature-vow",
      label: "⚔️ Giuramento",
      active: false,
      resourceReady: true,
      targetLabel: "bersaglio",
      theme: { accent: "#f97316" },
    }],
  };
  const payload = buildInitiativeCardContextMenuPayload({
    sourceEntry,
    scopeIds: ["paladin"],
  });
  assert.equal(payload.classFeatures[0].featureId, "feature-vow");
  assert.equal(payload.showClassFeatureResourceReset, true);

  const calls = [];
  const result = await routeInitiativeCardContextMenuAction(
    { sourceEntry, scopeIds: ["paladin", "enemy"] },
    { action: "class-feature-activate", value: "feature-vow" },
    { activateClassFeature: async (...args) => calls.push(["activate", ...args]) },
  );
  assert.equal(result, true);
  assert.deepEqual(calls, [["activate", sourceEntry, "feature-vow", ["paladin", "enemy"]]]);

  calls.length = 0;
  assert.equal(await routeInitiativeCardContextMenuAction(
    { sourceEntry, scopeIds: ["paladin"] },
    { action: "class-feature-deactivate", value: "instance-1" },
    { deactivateClassFeature: async (...args) => calls.push(["deactivate", ...args]) },
  ), true);
  assert.deepEqual(calls, [["deactivate", sourceEntry, "instance-1"]]);
});
