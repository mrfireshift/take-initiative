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
