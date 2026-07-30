import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import {
  factionColor,
  factionKey,
  getTrackerBaseItemId,
  spellOverviewGroupCanTerminate,
  spellOverviewGroups,
  spellTurnsLabel,
} from "../src/spellsPanelViewCore.js";

const META_KEY = ID + "/meta";
const SPELLS_META_KEY = ID + "/spells";
const CONC_META_KEY = ID + "/concentration";

function character(id, name, meta = {}) {
  return {
    id,
    name,
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: meta,
    },
  };
}

test("la presentazione fazione conserva chiavi e palette correnti", () => {
  const expected = {
    pc: "#38bdf8",
    ally: "#22c55e",
    neutral: "#eab308",
    enemy: "#ef4444",
  };

  for (const [attitude, color] of Object.entries(expected)) {
    const item = character(attitude, attitude, { attitude });
    assert.equal(factionKey(item), attitude);
    assert.equal(factionColor(item), color);
  }

  const unknown = character("unknown", "Unknown", { attitude: "hostile" });
  assert.equal(factionKey(unknown), "neutral");
  assert.equal(factionColor(unknown), expected.neutral);
});

test("gli ID virtuali tracker non vengono usati come creature reali", () => {
  assert.equal(getTrackerBaseItemId("goblin::p2"), "goblin");
  assert.equal(getTrackerBaseItemId("goblin"), "goblin");
  assert.equal(getTrackerBaseItemId("__LAIR__"), "");
  assert.equal(getTrackerBaseItemId("__EPIC__:dragon:1"), "");
  assert.equal(getTrackerBaseItemId(""), "");
});

test("le etichette durata privilegiano il confine esatto e poi il range round", () => {
  assert.equal(spellTurnsLabel([4, 3], ["F B", "F B"]), "F B");
  assert.equal(spellTurnsLabel([4, 3], ["4", "3"]), "3-4 round");
  assert.equal(spellTurnsLabel([2, 2], ["2", "2"]), "2 round");
  assert.equal(spellTurnsLabel([600], [""]), "");
  assert.equal(spellTurnsLabel([], []), "Durata non indicata");
});

test("la panoramica raggruppa una stessa istanza sui bersagli e riconcilia il caster", () => {
  const spell = {
    instanceId: "cast-1",
    spellId: "haste",
    name: "Velocità",
    casterId: "caster",
    conc: true,
    turns: 4,
    expiry: { mode: "turn-end", actor: "target" },
    castContext: { slotLevel: 3 },
  };
  const items = [
    character("target-a", "Bersaglio A", {
      [SPELLS_META_KEY]: [spell],
    }),
    character("target-b", "Bersaglio B", {
      [SPELLS_META_KEY]: [{ ...spell, turns: 3 }],
    }),
    character("caster", "Mago", {
      [CONC_META_KEY]: {
        haste: {
          instanceId: "cast-1",
          spellId: "haste",
          name: "Velocità",
          targets: ["target-a", "target-b"],
        },
      },
    }),
  ];

  const groups = spellOverviewGroups(items);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "instance:cast-1");
  assert.equal(groups[0].casterId, "caster");
  assert.equal(groups[0].casterName, "Mago");
  assert.equal(groups[0].concentrating, true);
  assert.equal(groups[0].concentrationRef, "cast-1");
  assert.deepEqual(groups[0].castContext, { slotLevel: 3 });
  assert.deepEqual(Array.from(groups[0].targets), [
    ["target-a", "Bersaglio A"],
    ["target-b", "Bersaglio B"],
  ]);
  assert.deepEqual(groups[0].turns, [4, 3]);
  assert.deepEqual(groups[0].counters, ["F B", "F B"]);
});

test("la panoramica registra anche una concentrazione priva di pill spell", () => {
  const items = [
    character("caster", "Mago", {
      [CONC_META_KEY]: {
        nube: {
          instanceId: "area-cast",
          spellId: "incendiary-cloud",
          name: "Nube incendiaria",
          targets: ["target"],
        },
      },
    }),
    character("target", "Goblin"),
  ];

  const groups = spellOverviewGroups(items);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "instance:area-cast");
  assert.equal(groups[0].instanceId, "area-cast");
  assert.equal(groups[0].spellId, "incendiary-cloud");
  assert.equal(groups[0].casterId, "caster");
  assert.equal(groups[0].casterName, "Mago");
  assert.equal(groups[0].concentrating, true);
  assert.equal(groups[0].concentrationRef, "area-cast");
  assert.deepEqual(Array.from(groups[0].targets), [["target", "Goblin"]]);
  assert.deepEqual(groups[0].turns, []);
});

test("il record tecnico di una zona conserva durata senza inventare il caster come bersaglio", () => {
  const items = [
    character("caster", "Mago", {
      [SPELLS_META_KEY]: [{
        instanceId: "maelstrom-area",
        spellId: "xanathar-maelstrom",
        name: "Maelstrom",
        casterId: "caster",
        conc: true,
        turns: 10,
        castContext: { staticZoneOwner: true },
      }],
      [CONC_META_KEY]: {
        maelstrom: {
          instanceId: "maelstrom-area",
          spellId: "xanathar-maelstrom",
          name: "Maelstrom",
          targets: [],
        },
      },
    }),
  ];

  const [group] = spellOverviewGroups(items);

  assert.equal(group.concentrating, true);
  assert.deepEqual(Array.from(group.targets), []);
  assert.deepEqual(group.turns, [10]);
});

test("un gruppo di sola concentrazione resta terminabile senza bersagli", () => {
  const group = {
    casterId: "caster",
    concentrating: true,
    targets: new Map(),
  };

  assert.equal(spellOverviewGroupCanTerminate(group), true);
  assert.equal(spellOverviewGroupCanTerminate({
    casterId: "",
    concentrating: false,
    targets: new Map(),
  }), false);
  assert.equal(spellOverviewGroupCanTerminate({
    casterId: "",
    concentrating: false,
    targets: new Map(),
  }, 1), true);
});

test("le spell legacy si raggruppano per caster e nome senza collisioni", () => {
  const items = [
    character("target-a", "A", {
      [SPELLS_META_KEY]: [
        { name: "Marchio", casterId: "caster-a", turns: 2 },
        { name: "Marchio", casterId: "caster-b", turns: 2 },
      ],
    }),
    character("caster-a", "Caster A"),
    character("caster-b", "Caster B"),
  ];

  const groups = spellOverviewGroups(items);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.casterId).sort(), [
    "caster-a",
    "caster-b",
  ]);
});

test("la panoramica raccoglie anche gli effetti figli su token esterni", () => {
  const spell = {
    instanceId: "ice-cast",
    spellId: "xanathar-investitura-del-ghiaccio",
    name: "Investitura del Ghiaccio",
    casterId: "caster",
    conc: true,
    turns: 100,
  };
  const items = [
    character("caster", "Druido", {
      [SPELLS_META_KEY]: [spell],
    }),
    character("target", "Goblin", {
      conditions: {
        version: 2,
        instances: [{
          id: "slow-instance",
          condition: "Velocità dimezzata",
          active: true,
          type: "spell",
          parentEffectId: "ice-cast",
          effectId: "ice-investiture-slow",
        }],
      },
    }),
  ];

  const [group] = spellOverviewGroups(items);

  assert.deepEqual(group.effectInstances, [{
    itemId: "target",
    instanceId: "slow-instance",
    effectId: "ice-investiture-slow",
    active: true,
  }]);
});
