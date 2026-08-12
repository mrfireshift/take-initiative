import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  SPELL_BOARD_TOKEN_META_KEY,
  getSpellBoardTokenPlacementRule,
  getSpellBoardTokenRule,
  planSpellBoardTokenStateUpdate,
  spellBoardTokenCanonicalMetadata,
  spellBoardTokenAssetPath,
  spellBoardTokenAssetPixelSize,
  spellBoardTokenItems,
  spellBoardTokenItemsEndedByPlan,
  spellBoardTokenMetadata,
  spellBoardTokenPlacementPosition,
  spellBoardTokenScale,
  spellBoardTokenView,
} from "../src/spellBoardTokenCore.js";
import {
  spellBoardTokenCompanionsByCasterId,
} from "../src/spellBoardTokenTrackerCore.js";
import {
  buildSpellActiveActionPlan,
  getSpellOverviewActions,
} from "../src/spellActiveActionCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";

const META_KEY = "com.thebigpicture.initiative/meta";
const spellApplicationExecutorSource = readFileSync(
  new URL("../src/spellApplicationExecutor.js", import.meta.url),
  "utf8",
);

function boardToken({
  id = "entity-1",
  spellId = "arcane-hand",
  instanceId = "cast-1",
  casterId = "caster",
  casterHpMax = 84,
  objectSize = "",
} = {}) {
  return {
    id,
    layer: "PROP",
    metadata: {
      [SPELL_BOARD_TOKEN_META_KEY]: spellBoardTokenMetadata({
        spellId,
        instanceId,
        casterId,
        slotLevel: 5,
        casterHpMax,
        objectSize,
      }),
    },
  };
}

test("il lotto usa cinque pedine da tabellone e non regole di area", () => {
  const ids = [
    "animate-objects",
    "spiritual-weapon",
    "arcane-sword",
    "tasha-lama-del-disastro",
    "arcane-hand",
  ];
  for (const id of ids) {
    const rule = getSpellBoardTokenRule(id);
    const spell = getSpellDefinition(id);
    assert.equal(rule?.spellId, id);
    assert.ok(["self", "selected"].includes(spell?.targetMode));
    assert.equal(spell?.boardToken?.spellId, id);
    assert.equal(id === "animate-objects" || spell?.activeActions?.length > 0, true);
    assert.equal(getSpellBoardTokenPlacementRule(id)?.kind, "board-token");
  }
  assert.equal(getSpellBoardTokenRule("fireball"), null);
});

test("le tre pedine d'arma occupano una casella", () => {
  const expectedPixelSizes = new Map([
    ["spiritual-weapon", 1067],
    ["arcane-sword", 1067],
    ["tasha-lama-del-disastro", 1254],
  ]);
  for (const [spellId, pixelSize] of expectedPixelSizes) {
    assert.equal(getSpellBoardTokenRule(spellId)?.assetPixelSize, pixelSize);
    assert.equal(getSpellBoardTokenRule(spellId)?.spaceCells, 1);
    assert.deepEqual(spellBoardTokenScale(spellId), { x: 1, y: 1 });
  }
});

test("Mano arcana usa il nuovo asset e occupa due caselle", () => {
  const rule = getSpellBoardTokenRule("arcane-hand");
  assert.equal(rule?.assetPath, "/spell-token-arcane-hand.webp");
  assert.equal(rule?.assetPixelSize, 560);
  assert.equal(rule?.spaceCells, 2);
  assert.deepEqual(spellBoardTokenScale("arcane-hand"), { x: 2, y: 2 });
});

test("Animare oggetti conserva taglia, PF canonici e dimensione della PROP", () => {
  const item = boardToken({
    id: "animated-large",
    spellId: "animate-objects",
    instanceId: "animated-cast",
    casterId: "caster",
    objectSize: "large",
  });
  const view = spellBoardTokenView(item);
  assert.equal(view.objectSize, "large");
  assert.equal(view.objectSizeLabel, "Grande");
  assert.equal(view.sizeCategory, "Large");
  assert.equal(view.spaceCells, 2);
  assert.equal(view.armorClass, 10);
  assert.equal(view.attackBonus, 6);
  assert.equal(view.attackDamage, "2d10 + 2");
  assert.equal(view.constitution, 10);
  assert.equal(view.intelligence, 3);
  assert.equal(view.wisdom, 3);
  assert.equal(view.charisma, 1);
  assert.equal(view.blindsightMeters, 9);
  assert.deepEqual(view.state, {
    revision: 0,
    hp: 50,
    hpMax: 50,
  });
  assert.deepEqual(spellBoardTokenScale("animate-objects", "large"), { x: 2, y: 2 });
});

test("Animare oggetti usa le dimensioni dichiarate per ogni taglia", () => {
  assert.deepEqual(spellBoardTokenScale("animate-objects", "tiny"), { x: 0.5, y: 0.5 });
  assert.deepEqual(spellBoardTokenScale("animate-objects", "small"), { x: 1, y: 1 });
  assert.deepEqual(spellBoardTokenScale("animate-objects", "medium"), { x: 1, y: 1 });
  assert.deepEqual(spellBoardTokenScale("animate-objects", "large"), { x: 2, y: 2 });
  assert.deepEqual(spellBoardTokenScale("animate-objects", "huge"), { x: 3, y: 3 });
});

test("Animare oggetti usa l'asset corretto per ciascun gruppo di taglie", () => {
  assert.equal(
    spellBoardTokenAssetPath("animate-objects", "tiny"),
    "/spell-token-animated-tiny-small.webp",
  );
  assert.equal(
    spellBoardTokenAssetPath("animate-objects", "small"),
    "/spell-token-animated-tiny-small.webp",
  );
  assert.equal(
    spellBoardTokenAssetPath("animate-objects", "medium"),
    "/spell-token-animated-medium.webp",
  );
  assert.equal(
    spellBoardTokenAssetPath("animate-objects", "large"),
    "/spell-token-animated-large-huge.webp",
  );
  assert.equal(
    spellBoardTokenAssetPath("animate-objects", "huge"),
    "/spell-token-animated-large-huge.webp",
  );
  assert.equal(spellBoardTokenAssetPixelSize("animate-objects", "tiny"), 1067);
  assert.equal(spellBoardTokenAssetPixelSize("animate-objects", "medium"), 1067);
  assert.equal(spellBoardTokenAssetPixelSize("animate-objects", "large"), 560);
  for (const assetPath of [
    "/spell-token-animated-tiny-small.webp",
    "/spell-token-animated-medium.webp",
    "/spell-token-animated-large-huge.webp",
  ]) {
    assert.equal(
      existsSync(new URL(`../public${assetPath}`, import.meta.url)),
      true,
      assetPath,
    );
  }
});

test("le pedine animate condividono l'istanza ma restano companion indipendenti", () => {
  const items = [
    boardToken({
      id: "animated-tiny",
      spellId: "animate-objects",
      instanceId: "animated-cast",
      casterId: "caster",
      objectSize: "tiny",
    }),
    boardToken({
      id: "animated-large",
      spellId: "animate-objects",
      instanceId: "animated-cast",
      casterId: "caster",
      objectSize: "large",
    }),
  ];
  const companions = spellBoardTokenCompanionsByCasterId(items).get("caster");
  assert.deepEqual(companions.map((companion) => [
    companion.itemId,
    companion.objectSizeLabel,
    companion.hp,
    companion.hpMax,
  ]), [
    ["animated-large", "Grande", 50, 50],
    ["animated-tiny", "Minuscola", 20, 20],
  ]);
});

test("il punto confermato del token usa il centro della casella scelto", () => {
  assert.deepEqual(spellBoardTokenPlacementPosition({
    position: { x: 225, y: 375 },
  }), { x: 225, y: 375 });
  assert.deepEqual(spellBoardTokenPlacementPosition({
    start: { x: 75, y: 75 },
  }), { x: 75, y: 75 });
  assert.equal(spellBoardTokenPlacementPosition({ position: { x: "x", y: 4 } }), null);
});

test("Mano arcana nasce con CA e PF propri senza usare gli HP del token caster", () => {
  const item = boardToken();
  const view = spellBoardTokenView(item);
  assert.equal(view.armorClass, 20);
  assert.equal(view.movementMeters, 18);
  assert.equal(view.reachMeters, 1.5);
  assert.equal(view.sizeCategory, "Large");
  assert.equal(view.spaceCells, 2);
  assert.equal(view.fillsSpace, false);
  assert.deepEqual(spellBoardTokenScale("arcane-hand"), { x: 2, y: 2 });
  assert.deepEqual(spellBoardTokenCanonicalMetadata({
    spellId: "arcane-hand",
    casterHpMax: 84,
  }), { hp: 84, hpMax: 84 });
  assert.deepEqual(view.state, {
    revision: 0,
    hp: 84,
    hpMax: 84,
    mode: "",
    targetIds: [],
  });
  assert.equal(item.metadata[SPELL_BOARD_TOKEN_META_KEY].casterId, "caster");
});

test("i metadata canonici delle pedine conservano l'attitudine del caster per la disclosure HP", () => {
  assert.deepEqual(spellBoardTokenCanonicalMetadata({
    spellId: "animate-objects",
    objectSize: "tiny",
    attitude: "PC",
  }), { hp: 20, hpMax: 20, attitude: "pc" });
  assert.deepEqual(spellBoardTokenCanonicalMetadata({
    spellId: "animate-objects",
    objectSize: "small",
    attitude: "ally",
  }), { hp: 25, hpMax: 25, attitude: "ally" });
  assert.deepEqual(spellBoardTokenCanonicalMetadata({
    spellId: "animate-objects",
    objectSize: "medium",
    attitude: "unknown",
  }), { hp: 40, hpMax: 40 });
});

test("la Mano usa gli HP canonici quando la PROP porta anche meta.hp/hpMax", () => {
  const item = boardToken();
  item.metadata[META_KEY] = { hp: 27, hpMax: 84, foreign: "keep" };
  assert.equal(spellBoardTokenView(item).state.hp, 27);
  assert.equal(spellBoardTokenView(item).state.hpMax, 84);

  const plan = planSpellBoardTokenStateUpdate({
    item,
    instanceId: "cast-1",
    hp: 0,
  });
  assert.equal(plan.valid, true);
  assert.equal(plan.after.hp, 0);
  assert.equal(plan.after.hpMax, 84);
  assert.equal(plan.metadata.state.hp, 0);
});

test("l'aggiornamento a 0 PF prepara la chiusura della Mano nella stessa transazione", () => {
  assert.match(spellApplicationExecutorSource, /type: "concentration:break"/);
  assert.match(spellApplicationExecutorSource, /type: "spell:remove-instance"/);
  assert.match(spellApplicationExecutorSource, /removeWhenZero: true/);
});

test("Animare oggetti rimuove solo la pedina arrivata a 0 PF", () => {
  assert.match(spellApplicationExecutorSource, /rule\?\.spellId === "animate-objects"/);
  assert.match(spellApplicationExecutorSource, /const itemId = String\(group\?\.itemId/);
  assert.match(spellApplicationExecutorSource, /removeWhenZero: true/);
});

test("le pedine si filtrano per istanza o caster e terminano col lifecycle spell", () => {
  const first = boardToken();
  const second = boardToken({
    id: "entity-2",
    spellId: "spiritual-weapon",
    instanceId: "cast-2",
    casterId: "cleric",
  });
  assert.deepEqual(
    spellBoardTokenItems([first, second], { casterId: "cleric" }).map((item) => item.id),
    ["entity-2"],
  );
  const ended = spellBoardTokenItemsEndedByPlan([first, second], {
    changes: [{
      before: {
        spells: [{ instanceId: "cast-1" }, { instanceId: "cast-2" }],
        concentrations: {},
      },
      after: {
        spells: [{ instanceId: "cast-2" }],
        concentrations: {},
      },
    }],
  });
  assert.deepEqual(ended.map((item) => item.id), ["entity-1"]);
});

test("modalita e PF di Mano arcana producono aggiornamenti revisionati", () => {
  const item = boardToken();
  const mode = planSpellBoardTokenStateUpdate({
    item,
    instanceId: "cast-1",
    action: { type: "set-mode", mode: "grasping", actionId: "arcane-hand-grasping" },
    targetIds: ["target", "target"],
  });
  assert.equal(mode.valid, true);
  assert.equal(mode.after.mode, "grasping");
  assert.deepEqual(mode.after.targetIds, ["target"]);
  assert.equal(mode.after.revision, 1);

  const updatedItem = {
    ...item,
    metadata: {
      ...item.metadata,
      [SPELL_BOARD_TOKEN_META_KEY]: mode.metadata,
    },
  };
  const hp = planSpellBoardTokenStateUpdate({
    item: updatedItem,
    instanceId: "cast-1",
    hp: 31,
  });
  assert.equal(hp.valid, true);
  assert.equal(hp.after.hp, 31);
  assert.equal(hp.after.revision, 2);

  const invalid = planSpellBoardTokenStateUpdate({
    item,
    instanceId: "cast-1",
    hp: 85,
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes("spell-board-token-hp-invalid"));
});

test("le modalita di Mano arcana aggiornano la pedina senza condizioni automatiche", () => {
  const spell = getSpellDefinition("arcane-hand");
  const plan = buildSpellActiveActionPlan({
    spell,
    actionId: "arcane-hand-interposing",
    group: {
      instanceId: "cast-1",
      casterId: "caster",
      name: spell.displayName,
      effectInstances: [],
    },
    selectedTargetIds: ["target"],
  });
  assert.equal(plan.valid, true);
  assert.deepEqual(plan.operations, []);
  assert.deepEqual(plan.subjectIds, ["target"]);
  assert.deepEqual(plan.entityAction, {
    type: "set-mode",
    mode: "interposing",
    actionId: "arcane-hand-interposing",
  });
});

test("le azioni descrittive restano riferimenti e non richiedono bersagli", () => {
  const spell = getSpellDefinition("spiritual-weapon");
  const [action] = getSpellOverviewActions({
    spell,
    casterId: "caster",
  });
  assert.equal(action.displayOnly, true);
  assert.equal(action.subjectMode, "none");
  assert.equal(action.requiresTargets, false);
});
