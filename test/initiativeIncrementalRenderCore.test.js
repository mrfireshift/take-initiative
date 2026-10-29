import assert from "node:assert/strict";
import test from "node:test";
import { ID } from "../src/constants.js";
import { classifySceneItemChanges } from "../src/sceneItemChangeDispatcherCore.js";
import { planIncrementalTrackerItemRender } from "../src/initiativeIncrementalRenderCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;

function token(overrides = {}) {
  return {
    id: "token-1",
    type: "IMAGE",
    name: "Goblin",
    image: { url: "goblin.png" },
    position: { x: 0, y: 0 },
    metadata: {
      [META_KEY]: {
        inInitiative: true,
        initiative: 12,
        attitude: "enemy",
        hp: 10,
        hpMax: 10,
      },
    },
    ...overrides,
  };
}

function plan(beforeItems, afterItems) {
  return planIncrementalTrackerItemRender(classifySceneItemChanges(beforeItems, afterItems));
}

test("HP, effetti, ritratto e risorse restano aggiornamenti locali", () => {
  const before = token();
  const hp = token({
    metadata: { [META_KEY]: { ...before.metadata[META_KEY], hp: 6 } },
  });
  assert.deepEqual(plan([before], [hp]), { mode: "cards", itemIds: ["token-1"] });

  const effects = token({
    metadata: {
      [META_KEY]: {
        ...before.metadata[META_KEY],
        conditions: { flags: { Prono: true } },
        [SPELLS_META_KEY]: [{ name: "Bless" }],
        legendary: { max: 3, current: 2 },
      },
    },
  });
  assert.deepEqual(plan([before], [effects]), { mode: "cards", itemIds: ["token-1"] });

  const portrait = token({ image: { url: "goblin-2.png" } });
  assert.deepEqual(plan([before], [portrait]), { mode: "cards", itemIds: ["token-1"] });
});

test("ordine, appartenenza, fazione, gruppi e boss virtuali richiedono il render completo", () => {
  const before = token();
  const structuralChanges = [
    token({ name: "(1) Goblin" }),
    token({ metadata: { [META_KEY]: { ...before.metadata[META_KEY], initiative: 15 } } }),
    token({ metadata: { [META_KEY]: { ...before.metadata[META_KEY], inInitiative: false } } }),
    token({ metadata: { [META_KEY]: { ...before.metadata[META_KEY], attitude: "pc" } } }),
    token({ metadata: { [META_KEY]: { ...before.metadata[META_KEY], epic: true } } }),
    token({ metadata: { [META_KEY]: { ...before.metadata[META_KEY], paragon: { actions: 2 } } } }),
  ];

  for (const after of structuralChanges) {
    assert.equal(plan([before], [after]).mode, "full");
  }
  assert.equal(plan([before], []).mode, "full");
});

test("una raffica mista usa il fallback strutturale e ignora token fuori iniziativa", () => {
  const beforeA = token();
  const beforeB = token({ id: "token-2", name: "Orco" });
  const afterA = token({
    metadata: { [META_KEY]: { ...beforeA.metadata[META_KEY], hp: 4 } },
  });
  const afterB = token({
    id: "token-2",
    name: "Orco Capo",
    metadata: beforeB.metadata,
  });
  assert.equal(plan([beforeA, beforeB], [afterA, afterB]).mode, "full");

  const outsideBefore = token({
    metadata: { [META_KEY]: { hp: 8, hpMax: 8, attitude: "enemy" } },
  });
  const outsideAfter = token({
    image: { url: "outside-2.png" },
    metadata: outsideBefore.metadata,
  });
  assert.deepEqual(plan([outsideBefore], [outsideAfter]), { mode: "none", itemIds: [] });
});

test("shared HP child changes invalidate their principal, including unlink and deletion", () => {
  const source = token({ id: "source" });
  const child = token({ id: "hand", metadata: { [META_KEY]: { hp: 10, hpMax: 10, sharedHpSourceId: "source" } } });
  const damaged = { ...child, metadata: { [META_KEY]: { ...child.metadata[META_KEY], hp: 6 } } };
  assert.deepEqual(plan([source, child], [source, damaged]), { mode: "cards", itemIds: ["source"] });
  for (const after of [[], [{ ...child, name: "New hand" }], [{ ...child, metadata: { [META_KEY]: { hp: 10, hpMax: 10 } } }]]) {
    assert.equal(plan([source, child], [source, ...after]).mode, "full");
  }
});

// Lot L16: a token shown or hidden by the GM changes no tracker field, and the card stayed as it was until the next
// render (a turn change). Its card now enters or leaves the players' tracker at once.
test("L16: mostrare o nascondere un token in iniziativa ridisegna subito il tracker", () => {
  const shown = token({ visible: true });
  const hidden = token({ visible: false });
  const showEvent = classifySceneItemChanges([hidden], [shown]);
  assert.equal(showEvent.flags.visibility, true);
  assert.equal(showEvent.flags.tracker, false, "the other tracker listeners (History, speed check) stay quiet");
  assert.deepEqual(plan([hidden], [shown]), { mode: "full", itemIds: [] });
  assert.deepEqual(plan([shown], [hidden]), { mode: "full", itemIds: [] });
});

test("L16: la visibilità di un token fuori dall'iniziativa o un semplice movimento non ridisegnano nulla", () => {
  const outside = (visible) => token({ visible, metadata: { [META_KEY]: { inInitiative: false, hp: 5, hpMax: 5 } } });
  assert.deepEqual(plan([outside(false)], [outside(true)]), { mode: "none", itemIds: [] });
  const moved = classifySceneItemChanges([token()], [token({ position: { x: 150, y: 0 } })]);
  assert.equal(moved.flags.visibility, false);
  assert.deepEqual(planIncrementalTrackerItemRender(moved), { mode: "none", itemIds: [] });
  // A batch with a visibility change elsewhere does not patch the cards of tokens that only moved.
  const ids = (items) => items.map((item, index) => ({ ...item, id: `token-${index + 1}` }));
  const batch = classifySceneItemChanges(
    ids([token(), outside(false)]),
    ids([token({ position: { x: 150, y: 0 } }), outside(true)]),
  );
  assert.equal(batch.flags.visibility, true);
  assert.equal(batch.flags.tracker, false);
  assert.deepEqual(planIncrementalTrackerItemRender(batch), { mode: "none", itemIds: [] });
});
