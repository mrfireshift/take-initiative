import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SPELL_BOARD_TOKEN_META_KEY,
  getSpellBoardTokenPlacementRule,
  getSpellBoardTokenRule,
  planSpellBoardTokenStateUpdate,
  spellBoardTokenCanonicalMetadata,
  spellBoardTokenItems,
  spellBoardTokenItemsEndedByPlan,
  spellBoardTokenMetadata,
  spellBoardTokenPlacementPosition,
  spellBoardTokenScale,
  spellBoardTokenView,
} from "../src/spellBoardTokenCore.js";
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
      }),
    },
  };
}

test("il lotto usa quattro pedine da tabellone e non regole di area", () => {
  const ids = [
    "spiritual-weapon",
    "arcane-sword",
    "tasha-lama-del-disastro",
    "arcane-hand",
  ];
  for (const id of ids) {
    const rule = getSpellBoardTokenRule(id);
    const spell = getSpellDefinition(id);
    assert.equal(rule?.spellId, id);
    assert.equal(spell?.targetMode, "self");
    assert.equal(spell?.boardToken?.spellId, id);
    assert.ok(spell?.activeActions?.length > 0);
    assert.equal(getSpellBoardTokenPlacementRule(id)?.kind, "board-token");
  }
  assert.equal(getSpellBoardTokenRule("fireball"), null);
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
