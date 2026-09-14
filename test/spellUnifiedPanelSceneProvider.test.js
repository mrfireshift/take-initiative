import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import {
  buildSpellUnifiedPanelContract,
} from "../src/spellUnifiedPanelCore.js";
import {
  createSpellUnifiedPanelSceneProvider,
  getActiveConcentration,
  getAllInitiativeCharacters,
  getCardTargetIds,
  getContextOrSelectionIds,
  getSpellAreaSpatialValidation,
  getSpellOverviewSnapshot,
  getSpellTeleportPassengerCandidateIds,
  reprojectSpellOverviewForInitiativeState,
  validateSpellUnifiedTargetSelection,
  validateSpellAreaSceneSpatial,
} from "../src/spellUnifiedPanelSceneProvider.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const CONCENTRATION_KEY = `${ID}/concentration`;
const SPELLS_KEY = `${ID}/spells`;
const BOARD_TOKEN_KEY = `${ID}/spellBoardToken`;
const AURA_KEY = `${ID}/spellAura`;
const STATIC_ZONE_KEY = `${ID}/spellStaticZone`;

function character(id, name, meta = {}) {
  return {
    id,
    name,
    layer: "CHARACTER",
    metadata: { [META_KEY]: meta },
  };
}

function fakeObr(items, {
  order = [],
  selection = [],
  contextItems = [],
  geometryById = {},
} = {}) {
  const state = {
    selection: [...selection],
    contextItems: [...contextItems],
  };
  const sceneItems = {
    getItems: async (query) => {
      if (Array.isArray(query)) {
        const wanted = new Set(query);
        return items.filter((item) => wanted.has(item.id));
      }
      if (typeof query === "function") return items.filter(query);
      return [...items];
    },
    getItemBounds: async (ids) => geometryById[ids?.[0]] || null,
    onChange: () => () => {},
  };
  return {
    scene: {
      getMetadata: async () => ({
        [STATE_KEY]: { order, current: 0, round: 2 },
      }),
      items: sceneItems,
      grid: {
        getDpi: async () => 150,
        getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
      },
    },
    contextMenu: {
      getContext: async () => ({
        items: state.contextItems.map((id) => ({ id })),
      }),
    },
    player: {
      getSelection: async () => [...state.selection],
      select: async (ids) => {
        state.selection = [...ids];
      },
      onChange: () => () => {},
    },
  };
}

test("il provider preferisce il contesto e poi la selezione della scena", async () => {
  const obr = fakeObr([], {
    selection: ["selected-a"],
    contextItems: ["context-a", "context-b"],
  });

  assert.deepEqual(await getContextOrSelectionIds(obr), ["context-a", "context-b"]);

  obr.contextMenu.getContext = async () => ({ items: [] });
  assert.deepEqual(await getContextOrSelectionIds(obr), ["selected-a"]);
});

test("il provider ordina i combattenti e non espone gli ID virtuali come bersagli", async () => {
  const items = [
    character("a", "A", { inInitiative: true }),
    character("b", "B", { inInitiative: true }),
    character("outside", "Fuori", { inInitiative: true }),
    character("__LAIR__", "Lair", { inInitiative: true }),
  ];
  const obr = fakeObr(items, {
    order: ["__LAIR__", "a::p2", "__EPIC__:dragon:1", "b"],
    selection: ["outside", "b", "not-a-character"],
  });

  const active = await getAllInitiativeCharacters(obr);
  assert.deepEqual(active.map((item) => item.id), ["a", "b", "outside"]);
  assert.deepEqual(
    await getCardTargetIds(obr, "a", active),
    ["outside", "b"],
  );
});

test("il candidato bersaglio conserva un testo visibile quando il nome item è vuoto", () => {
  const provider = createSpellUnifiedPanelSceneProvider({});

  assert.equal(provider.targetCandidate({
    id: "goblin-1",
    name: "",
    text: { plainText: "Goblin rosso" },
    metadata: { [META_KEY]: {} },
  }).label, "Goblin rosso");

  assert.equal(provider.targetCandidate({
    id: "token-1",
    name: "",
    metadata: { [META_KEY]: {} },
  }).label, "token-1");
});

test("il candidato Turbine mantiene PG, alleati e neutrali sotto il gate 3x3 con immagini ad alta risoluzione", () => {
  const provider = createSpellUnifiedPanelSceneProvider({});
  for (const attitude of ["pc", "ally", "neutral"]) {
    const candidate = provider.targetCandidate({
      id: `turbine-${attitude}`,
      name: attitude,
      layer: "CHARACTER",
      image: { width: 512, height: 512 },
      grid: { dpi: 512 },
      scale: { x: 1, y: 1 },
      metadata: { [META_KEY]: { attitude } },
    });
    assert.equal(candidate.faction, attitude);
    assert.equal(candidate.turbineSize, "large-or-smaller");
  }
});

test("il provider risolve la concentrazione attiva usando le dichiarazioni esistenti", async () => {
  const obr = fakeObr([
    character("caster", "Caster", {
      [CONCENTRATION_KEY]: {
        bless: {
          instanceId: "bless-1",
          spellId: "bless",
          name: "Benedizione",
          targets: ["target"],
        },
      },
    }),
  ]);

  const active = await getActiveConcentration(obr, "caster", { id: "bless" });
  assert.equal(active.instanceId, "bless-1");
  assert.deepEqual(active.targets, ["target"]);
});

test("l'overview espone solo proiezioni read-only per spell attive e pedine", async () => {
  const spellRecords = [
    {
      instanceId: "bless-1",
      spellId: "bless",
      name: "Benedizione",
      casterId: "caster",
      conc: true,
      turns: 10,
      castContext: { slotLevel: 1 },
    },
    {
      instanceId: "hand-1",
      spellId: "arcane-hand",
      name: "Mano arcana",
      casterId: "caster",
      conc: true,
      turns: 10,
    },
    {
      instanceId: "lightning-1",
      spellId: "call-lightning",
      name: "Invocare il fulmine",
      casterId: "caster",
      conc: true,
      turns: 10,
      castContext: { slotLevel: 5 },
    },
  ];
  const items = [
    character("caster", "Caster", {
      [CONCENTRATION_KEY]: {
        bless: {
          instanceId: "bless-1",
          spellId: "bless",
          name: "Benedizione",
          targets: ["target"],
        },
        hand: {
          instanceId: "hand-1",
          spellId: "arcane-hand",
          name: "Mano arcana",
          targets: ["target"],
        },
      },
    }),
    character("target", "Bersaglio", { [SPELLS_KEY]: spellRecords }),
    {
      id: "hand-token",
      name: "Mano arcana",
      layer: "PROP",
      metadata: {
        [BOARD_TOKEN_KEY]: {
          kind: "spell-board-token",
          spellId: "arcane-hand",
          instanceId: "hand-1",
          casterId: "caster",
          state: { mode: "" },
        },
      },
    },
  ];
  const obr = fakeObr(items, { order: ["caster", "target"] });

  const overview = await getSpellOverviewSnapshot(obr);
  const bless = overview.find((entry) => entry.key === "instance:bless-1");
  const hand = overview.find((entry) => entry.key === "instance:hand-1");
  const callLightning = overview.find((entry) => entry.key === "instance:lightning-1");

  assert.equal(bless.name, "Benedizione");
  assert.deepEqual(bless.targetNames, ["Bersaglio"]);
  assert.equal(bless.concentrating, true);
  assert.equal(hand.tokenLabel, "Pedina sul campo");
  assert.equal(hand.persistent.kind, "board-token");
  assert.equal(hand.persistent.state, "present");
  assert.equal(hand.persistent.token.state.mode, "");
  assert.equal(typeof hand.key, "string");
  assert.equal(Object.prototype.hasOwnProperty.call(hand, "spellId"), false);
  assert.deepEqual(callLightning.actions.map((action) => action.id), [
    "call-lightning-strike",
  ]);
  assert.equal(callLightning.actions[0].buttonLabel, "Invoca fulmine");
  assert.equal(callLightning.actions[0].availability.turnStartPrompt, true);
});

test("l'overview distingue zona, aura automatica e scene item senza lifecycle", async () => {
  const items = [
    character("caster", "Caster", {
      [SPELLS_KEY]: [
        {
          instanceId: "zone-1",
          spellId: "xanathar-sfera-della-tempesta",
          name: "Sfera della Tempesta",
          casterId: "caster",
          turns: 10,
          castContext: { staticZoneOwner: true },
        },
        {
          instanceId: "aura-1",
          spellId: "xanathar-investitura-della-fiamma",
          name: "Investitura della Fiamma",
          casterId: "caster",
          conc: true,
          turns: 10,
          castContext: { mobileAura: true, slotLevel: 6 },
        },
      ],
    }),
    {
      id: "zone-root",
      name: "Sfera della Tempesta",
      layer: "DRAWING",
      metadata: {
        [STATIC_ZONE_KEY]: {
          role: "root",
          instanceId: "zone-1",
          spellId: "xanathar-sfera-della-tempesta",
          casterId: "caster",
          ruleId: "xanathar-sfera-della-tempesta:cast",
        },
      },
    },
    {
      id: "aura-visual",
      name: "Aura mobile",
      layer: "DRAWING",
      metadata: {
        [AURA_KEY]: {
          instanceId: "aura-1",
          spellId: "xanathar-investitura-della-fiamma",
          casterId: "caster",
        },
      },
    },
    {
      id: "orphan-token",
      name: "Mano arcana",
      layer: "PROP",
      metadata: {
        [BOARD_TOKEN_KEY]: {
          kind: "spell-board-token",
          spellId: "arcane-hand",
          instanceId: "orphan-1",
          casterId: "caster",
          state: { hp: 10, hpMax: 10 },
        },
      },
    },
  ];
  const overview = await getSpellOverviewSnapshot(fakeObr(items, { order: ["caster"] }));
  const zone = overview.find((entry) => entry.persistent?.instanceId === "zone-1");
  const aura = overview.find((entry) => entry.persistent?.instanceId === "aura-1");
  const orphan = overview.find((entry) => entry.persistent?.instanceId === "orphan-1");

  assert.equal(zone.persistent.kind, "zone");
  assert.equal(zone.persistent.itemPresent, true);
  assert.equal(aura.persistent.kind, "aura");
  assert.equal(aura.persistent.itemPresent, true);
  assert.equal(aura.persistent.slotLevel, 6);
  assert.equal(orphan.persistent.kind, "board-token");
  assert.equal(orphan.persistent.lifecyclePresent, false);
  assert.equal(orphan.persistent.state, "lifecycle-missing");
});

test("il provider di scena espone una superficie runtime sostituibile nei test", async () => {
  const provider = createSpellUnifiedPanelSceneProvider(fakeObr([]));
  assert.equal(typeof provider.getCatalogEntries, "function");
  assert.equal(typeof provider.getOverview, "function");
  assert.deepEqual(await provider.getSelection(), []);
  assert.deepEqual(await provider.getOverview(), []);
});

test("ARCH-07 T3/T4/T5: initiative/state riproietta il turno, ignora metadata estranei e si disiscrive", async () => {
  let metadata = {
    [STATE_KEY]: { order: ["caster", "other"], current: 0, round: 2 },
    unrelated: { value: 1 },
  };
  const metadataListeners = new Set();
  const obr = fakeObr([]);
  obr.scene.getMetadata = async () => metadata;
  obr.scene.onMetadataChange = (callback) => {
    metadataListeners.add(callback);
    return () => metadataListeners.delete(callback);
  };
  const received = [];
  const provider = createSpellUnifiedPanelSceneProvider(obr);
  const unsubscribe = provider.onInitiativeStateChange((state) => received.push(state));
  await new Promise((resolve) => setImmediate(resolve));

  metadata = { ...metadata, unrelated: { value: 2 } };
  for (const listener of metadataListeners) listener(metadata);
  assert.deepEqual(received, []);

  metadata = {
    ...metadata,
    [STATE_KEY]: { order: ["caster", "other"], current: 1, round: 2 },
  };
  for (const listener of metadataListeners) listener(metadata);
  assert.deepEqual(received, [{ order: ["caster", "other"], current: 1, round: 2 }]);

  const overview = [{
    instanceId: "heat-1",
    name: "Riscaldare il Metallo",
    context: {
      spellId: "heat-metal",
      instanceId: "heat-1",
      casterId: "caster",
      targetIds: ["other"],
      targetNames: ["Other"],
      castContext: {},
      effectInstances: [],
      appliedAt: { turnKey: "2:0:caster" },
    },
  }];
  const sameRound = reprojectSpellOverviewForInitiativeState(overview, {
    order: ["caster", "other"], current: 0, round: 2,
  });
  const nextRound = reprojectSpellOverviewForInitiativeState(overview, {
    order: ["caster", "other"], current: 0, round: 3,
  });
  assert.equal(sameRound[0].actions[0].available, false);
  assert.equal(nextRound[0].actions[0].available, true);
  assert.equal(nextRound[0].context.turnKey, "3:0:caster");

  unsubscribe();
  assert.equal(metadataListeners.size, 0);
  metadata = {
    ...metadata,
    [STATE_KEY]: { order: ["caster", "other"], current: 0, round: 3 },
  };
  for (const listener of metadataListeners) listener(metadata);
  assert.equal(received.length, 1);
});

test("ARCH-07 T7: un callback metadata tardivo della scena precedente non passa al pannello", async () => {
  let ready = true;
  let epoch = 1;
  const lifecycleListeners = new Set();
  const sceneLifecycle = {
    isReady: () => ready,
    capture: () => ({ epoch }),
    isCurrent: (operation) => ready && operation?.epoch === epoch,
    subscribe: (callback) => {
      lifecycleListeners.add(callback);
      return () => lifecycleListeners.delete(callback);
    },
  };
  const metadataListeners = new Set();
  const obr = fakeObr([]);
  obr.scene.getMetadata = async () => ({
    [STATE_KEY]: { order: ["caster-a", "caster-b"], current: 0, round: 2 },
  });
  obr.scene.onMetadataChange = (callback) => {
    metadataListeners.add(callback);
    return () => metadataListeners.delete(callback);
  };
  const received = [];
  const provider = createSpellUnifiedPanelSceneProvider(obr, { sceneLifecycle });
  const unsubscribe = provider.onInitiativeStateChange((state) => received.push(state));
  await new Promise((resolve) => setImmediate(resolve));
  const staleCallback = [...metadataListeners][0];

  ready = false;
  for (const listener of lifecycleListeners) listener({ phase: "unavailable" });
  assert.equal(metadataListeners.size, 0);

  ready = true;
  epoch = 2;
  for (const listener of lifecycleListeners) listener({ phase: "ready" });
  await new Promise((resolve) => setImmediate(resolve));
  staleCallback({
    [STATE_KEY]: { order: ["caster-a", "caster-b"], current: 1, round: 2 },
  });
  assert.deepEqual(received, []);

  for (const listener of metadataListeners) listener({
    [STATE_KEY]: { order: ["caster-a", "caster-b"], current: 1, round: 3 },
  });
  assert.deepEqual(received, [{ order: ["caster-a", "caster-b"], current: 1, round: 3 }]);

  unsubscribe();
  assert.equal(metadataListeners.size, 0);
  assert.equal(lifecycleListeners.size, 0);
});

test("il provider calcola snapshot spaziali per Catena di fulmini", async () => {
  const items = [
    character("caster", "Caster"),
    character("primary", "Primario"),
    character("secondary", "Secondario"),
  ];
  const obr = fakeObr(items, {
    geometryById: {
      caster: { min: { x: 0, y: 0 }, max: { x: 150, y: 150 } },
      primary: { min: { x: 300, y: 0 }, max: { x: 450, y: 150 } },
      secondary: { min: { x: 450, y: 0 }, max: { x: 600, y: 150 } },
    },
  });
  const contract = buildSpellUnifiedPanelContract({ spellId: "chain-lightning" });
  const snapshot = await getSpellAreaSpatialValidation(obr, {
    contract,
    session: {
      casterId: "caster",
      primaryTargetId: "primary",
      targetIds: ["primary", "secondary"],
    },
  });

  assert.equal(snapshot.primaryDistanceMeters, 3);
  assert.equal(snapshot.secondaryDistancesMeters.secondary, 1.5);
});

test("il provider limita la selezione dei secondari al riferimento di 9 m", async () => {
  const items = [
    character("caster", "Caster"),
    character("primary", "Primario"),
    character("secondary", "Secondario"),
  ];
  const obr = fakeObr(items, {
    geometryById: {
      caster: { min: { x: 0, y: 0 }, max: { x: 150, y: 150 } },
      primary: { min: { x: 300, y: 0 }, max: { x: 450, y: 150 } },
      secondary: { min: { x: 1800, y: 0 }, max: { x: 1950, y: 150 } },
    },
  });
  const contract = buildSpellUnifiedPanelContract({ spellId: "chain-lightning" });
  const result = await validateSpellUnifiedTargetSelection(obr, {
    contract,
    session: {
      casterId: "caster",
      slotLevel: 6,
      primaryTargetId: "primary",
    },
    targetIds: ["primary", "secondary"],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("secondary-out-of-range"));
  assert.deepEqual(result.invalidDistanceTargetIds, ["secondary"]);
});

test("il provider applica la validazione spaziale del workflow save", async () => {
  const items = [character("caster", "Caster"), character("target", "Target")];
  const obr = fakeObr(items, {
    geometryById: {
      caster: { min: { x: 0, y: 0 }, max: { x: 150, y: 150 } },
      target: { min: { x: 2100, y: 0 }, max: { x: 2250, y: 150 } },
    },
  });
  const result = await validateSpellAreaSceneSpatial(obr, {
    command: {
      spell: { spellId: "banishment", casterId: "caster", slotLevel: 4 },
      targeting: {
        mode: "discrete",
        targetIds: ["target"],
        targetContexts: { target: { planeOrigin: "current-plane" } },
      },
    },
    spell: { id: "banishment" },
    items,
    targetIds: ["target"],
    caster: items[0],
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors.includes("caster-range-exceeded"), true);
});

test("l'area ancorata mantiene il primary di una pedina grande e rifiuta anchor stale", async () => {
  const items = [
    character("large-primary", "Primario grande"),
    character("nearby", "Vicino"),
  ];
  const obr = fakeObr(items, {
    geometryById: {
      "large-primary": { min: { x: 0, y: 0 }, max: { x: 300, y: 300 } },
      nearby: { min: { x: 450, y: 0 }, max: { x: 600, y: 150 } },
    },
  });
  const baseCommand = {
    spell: {
      spellId: "phb2014-freccia-folgorante",
      casterId: "caster",
      slotLevel: 3,
    },
    targeting: {
      mode: "geometric",
      areaAnchor: "primary-target",
      primaryTargetId: "large-primary",
      targetIds: ["large-primary", "nearby"],
    },
    placement: {
      status: "confirmed",
      targetIds: ["large-primary", "nearby"],
      anchorTargetId: "large-primary",
      preview: {
        anchorTargetId: "large-primary",
        anchorOrigin: { x: 150, y: 150 },
        targetIds: ["large-primary", "nearby"],
      },
    },
  };

  const valid = await validateSpellAreaSceneSpatial(obr, {
    command: baseCommand,
    items,
    targetIds: ["large-primary", "nearby"],
  });
  assert.equal(valid.valid, true, valid.errors?.join(", "));

  const mismatch = await validateSpellAreaSceneSpatial(obr, {
    command: {
      ...baseCommand,
      placement: {
        ...baseCommand.placement,
        anchorTargetId: "nearby",
        preview: { ...baseCommand.placement.preview, anchorTargetId: "nearby" },
      },
    },
    items,
    targetIds: ["large-primary", "nearby"],
  });
  assert.deepEqual(mismatch, { valid: false, errors: ["placement-anchor-mismatch"] });

  const stale = await validateSpellAreaSceneSpatial(obr, {
    command: {
      ...baseCommand,
      placement: {
        ...baseCommand.placement,
        preview: { ...baseCommand.placement.preview, anchorOrigin: { x: 999, y: 999 } },
      },
    },
    items,
    targetIds: ["large-primary", "nearby"],
  });
  assert.deepEqual(stale, { valid: false, errors: ["placement-anchor-stale"] });
});

test("Dimension Door misura separatamente gittata della destinazione e prossimità del passeggero", async () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "dimension-door" });
  const items = [
    character("caster", "Caster"),
    character("passenger", "Passeggero"),
  ];
  const placement = {
    status: "confirmed",
    confirmed: true,
    spellId: "dimension-door",
    ruleId: "dimension-door:cast",
    casterId: "caster",
    preview: {
      type: "square",
      position: { x: 1500, y: 0 },
      start: { x: 1500, y: 0 },
      end: { x: 1650, y: 150 },
      gridOrigin: { x: 0, y: 0 },
      dpi: 150,
    },
  };
  const obr = fakeObr(items, {
    geometryById: {
      caster: { min: { x: 0, y: 0 }, max: { x: 150, y: 150 } },
      passenger: { min: { x: 150, y: 0 }, max: { x: 300, y: 150 } },
    },
  });
  const spatial = await getSpellAreaSpatialValidation(obr, {
    contract,
    session: {
      casterId: "caster",
      passengerId: "passenger",
      placement,
    },
    items,
  });
  assert.equal(spatial.mode, "teleport");
  assert.equal(spatial.invalidDestination, false);
  assert.deepEqual(spatial.invalidPassengerIds, []);
  assert.equal(spatial.passengerAdjacent, true);
  assert.deepEqual(spatial.passengerRelativeOffset, { x: 150, y: 0 });
  assert.equal(spatial.destinationDistanceMeters <= 150, true);
  assert.equal(spatial.passengerDistanceMeters <= 1.5, true);

  const selection = await validateSpellUnifiedTargetSelection(obr, {
    contract,
    session: { casterId: "caster", passengerId: "passenger", placement },
    targetIds: ["passenger"],
  });
  assert.equal(selection.valid, true, selection.errors?.join(", "));

  const diagonalPassengerObr = fakeObr(items, {
    geometryById: {
      caster: { min: { x: 0.2, y: -0.2 }, max: { x: 150.2, y: 149.8 } },
      passenger: { min: { x: 150.6, y: 150.2 }, max: { x: 300.6, y: 300.2 } },
    },
  });
  const diagonalPassenger = await getSpellAreaSpatialValidation(diagonalPassengerObr, {
    contract,
    session: { casterId: "caster", passengerId: "passenger", placement },
    items,
  });
  assert.equal(diagonalPassenger.passengerAdjacent, true);
  assert.equal(diagonalPassenger.passengerDistanceMeters > 1.5, true);
  assert.deepEqual(diagonalPassenger.invalidPassengerIds, []);

  const farPassengerObr = fakeObr([
    items[0],
    { ...items[1], position: { x: 600, y: 0 } },
  ], {
    geometryById: {
      caster: { min: { x: 0, y: 0 }, max: { x: 150, y: 150 } },
      passenger: { min: { x: 600, y: 0 }, max: { x: 750, y: 150 } },
    },
  });
  const farPassenger = await getSpellAreaSpatialValidation(farPassengerObr, {
    contract,
    session: { casterId: "caster", passengerId: "passenger", placement },
    items: farPassengerObr.scene.items
      ? await farPassengerObr.scene.items.getItems()
      : [],
  });
  assert.deepEqual(farPassenger.invalidPassengerIds, ["passenger"]);

  const farDestination = await getSpellAreaSpatialValidation(obr, {
    contract,
    session: {
      casterId: "caster",
      placement: {
        ...placement,
        preview: {
          ...placement.preview,
          position: { x: 20000, y: 0 },
          start: { x: 20000, y: 0 },
          end: { x: 20150, y: 150 },
        },
      },
    },
    items,
  });
  assert.equal(farDestination.invalidDestination, true);

  const overlappingPassenger = await getSpellAreaSpatialValidation(fakeObr(items, {
    geometryById: {
      caster: { min: { x: 0, y: 0 }, max: { x: 150, y: 150 } },
      passenger: { min: { x: 0, y: 0 }, max: { x: 150, y: 150 } },
    },
  }), {
    contract,
    session: { casterId: "caster", passengerId: "passenger", placement },
  });
  assert.equal(overlappingPassenger.passengerAdjacent, false);
  assert.deepEqual(overlappingPassenger.invalidPassengerIds, ["passenger"]);

  const distantPassenger = await getSpellAreaSpatialValidation(fakeObr(items, {
    geometryById: {
      caster: { min: { x: 0, y: 0 }, max: { x: 150, y: 150 } },
      passenger: { min: { x: 300, y: 0 }, max: { x: 450, y: 150 } },
    },
  }), {
    contract,
    session: { casterId: "caster", passengerId: "passenger", placement },
  });
  assert.equal(distantPassenger.passengerAdjacent, false);
  assert.deepEqual(distantPassenger.invalidPassengerIds, ["passenger"]);
});

test("Dimension Door non blocca il cast se la geometria live non è leggibile: resta GM-assisted", async () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "dimension-door" });
  const obr = fakeObr([character("caster", "Caster")]);
  obr.scene.items.getItems = async () => {
    throw new Error("scene-read-unavailable");
  };
  obr.scene.items.getItemBounds = () => {
    throw new Error("bounds-read-unavailable");
  };
  obr.scene.grid.getDpi = () => {
    throw new Error("dpi-read-unavailable");
  };
  obr.scene.grid.getScale = () => {
    throw new Error("scale-read-unavailable");
  };

  const spatial = await getSpellAreaSpatialValidation(obr, {
    contract,
    session: {
      casterId: "caster",
      placement: {
        status: "confirmed",
        preview: {
          type: "square",
          start: { x: 1500, y: 0 },
          end: { x: 1650, y: 150 },
          gridOrigin: { x: 1500, y: 0 },
        },
      },
    },
  });

  assert.equal(spatial.invalidDestination, false);
  assert.deepEqual(spatial.invalidPassengerIds, []);
  assert.equal(spatial.destinationDistanceMeters, null);
});

test("Dimension Door espone soltanto i passeggeri nelle caselle adiacenti", async () => {
  const items = [
    character("caster", "Caster"),
    character("side", "Laterale"),
    character("diagonal", "Diagonale"),
    character("far", "Lontano"),
    character("overlap", "Sovrapposto"),
  ];
  const obr = fakeObr(items, {
    geometryById: {
      caster: { min: { x: 0, y: 0 }, max: { x: 150, y: 150 } },
      side: { min: { x: 150, y: 0 }, max: { x: 300, y: 150 } },
      diagonal: { min: { x: 152.5, y: 152 }, max: { x: 302.5, y: 302 } },
      far: { min: { x: 450, y: 0 }, max: { x: 600, y: 150 } },
      overlap: { min: { x: 0, y: 0 }, max: { x: 150, y: 150 } },
    },
  });
  const candidates = items.map((item) => ({
    key: item.id,
    label: item.name,
    isCreature: true,
  }));

  assert.deepEqual(
    await getSpellTeleportPassengerCandidateIds(obr, {
      casterId: "caster",
      candidates,
    }),
    ["side", "diagonal"],
  );
});

test("Dimension Door considera anche una creatura fuori iniziativa se è adiacente", async () => {
  const items = [
    character("caster", "Caster", { inInitiative: true }),
    character("adjacent", "Adiacente"),
    character("far", "Lontano"),
  ];
  const obr = fakeObr(items, {
    order: ["caster"],
    geometryById: {
      caster: { min: { x: 0, y: 0 }, max: { x: 150, y: 150 } },
      adjacent: { min: { x: 150, y: 0 }, max: { x: 300, y: 150 } },
      far: { min: { x: 600, y: 0 }, max: { x: 750, y: 150 } },
    },
  });
  const provider = createSpellUnifiedPanelSceneProvider(obr);
  const candidates = await provider.getTargetCandidates("dimension-door");

  assert.deepEqual(
    await provider.getTeleportPassengerCandidateIds("caster", candidates),
    ["adjacent"],
  );
});

test("Dimension Door considera una creatura CHARACTER senza metadata del tracker", async () => {
  const items = [
    character("caster", "Caster", { inInitiative: true }),
    {
      id: "untracked-adjacent",
      name: "Creatura adiacente",
      layer: "CHARACTER",
      position: { x: 150, y: 0 },
    },
  ];
  const obr = fakeObr(items, {
    order: ["caster"],
    geometryById: {
      caster: { min: { x: 0, y: 0 }, max: { x: 150, y: 150 } },
      "untracked-adjacent": { min: { x: 150, y: 0 }, max: { x: 300, y: 150 } },
    },
  });
  const provider = createSpellUnifiedPanelSceneProvider(obr);
  const candidates = await provider.getTargetCandidates("dimension-door");

  assert.equal(candidates.some((candidate) => candidate.key === "untracked-adjacent"), true);
  assert.deepEqual(
    await provider.getTeleportPassengerCandidateIds("caster", candidates),
    ["untracked-adjacent"],
  );
});

test("Dimension Door non offre passeggeri se il footprint del caster non è misurabile", async () => {
  const items = [character("caster", "Caster"), character("passenger", "Passeggero")];
  const obr = fakeObr(items);
  const candidates = items.map((item) => ({
    key: item.id,
    label: item.name,
    isCreature: true,
  }));

  assert.deepEqual(
    await getSpellTeleportPassengerCandidateIds(obr, {
      casterId: "caster",
      candidates,
    }),
    [],
  );
});
