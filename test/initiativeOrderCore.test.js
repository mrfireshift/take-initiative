import test from "node:test";
import assert from "node:assert/strict";
import {
  __autoCollapseSnapshot,
  __buildGroups,
  __groupKey,
  _indexName,
  _parseIndexedName,
  compactEntriesForRender,
  expandParagonEntries,
  reorderBlockWithinSameInitiativeState,
  reorderWithinSameInitiativeState,
  sanitizeState,
  sortByInitiative,
} from "../src/initiativeOrderCore.js";

const actor = (id, name, initiative = 10, attitude = "enemy", extra = {}) => ({
  id,
  name,
  initiative,
  attitude,
  ...extra,
});

test("normalizza i prefissi numerici dei nomi senza perdere il primo indice", () => {
  assert.deepEqual(_parseIndexedName("(12) (3) Kobold"), { index: 12, base: "Kobold" });
  assert.deepEqual(_parseIndexedName("  Priest  "), { index: null, base: "Priest" });
  assert.equal(_indexName("Kobold", 4), "(4) Kobold");
});

test("raggruppa per fazione e nome base ma isola Epic Action e Paragon", () => {
  const kobold1 = actor("k1", "(1) Kobold");
  const kobold2 = actor("k2", "(2) Kobold");
  const allyKobold = actor("a1", "Kobold", 10, "ally");
  const epicAction = actor("epic", "Kobold", 10, "enemy", { isEpicAction: true });
  const paragon = actor("boss::p1", "Kobold", 10, "enemy", { __paragonIndex: 1 });
  const groups = __buildGroups([kobold1, kobold2, allyKobold, epicAction, paragon]);

  assert.deepEqual(groups.get(__groupKey(kobold1)).map((entry) => entry.id), ["k1", "k2"]);
  assert.notEqual(__groupKey(kobold1), __groupKey(allyKobold));
  assert.equal(groups.get(__groupKey(epicAction)).length, 1);
  assert.equal(groups.get(__groupKey(paragon)).length, 1);
});

test("espande le azioni Paragon conservando ID base e iniziative dedicate", () => {
  const source = actor("boss", "Boss", 18, "enemy", { paragonActions: 3 });
  const expanded = expandParagonEntries([source], { paragonInits: { boss: [19, 14, 8] } });
  assert.deepEqual(expanded.map((entry) => entry.id), ["boss", "boss::p1", "boss::p2"]);
  assert.deepEqual(expanded.map((entry) => entry.initiative), [19, 14, 8]);
  assert.deepEqual(expanded.map((entry) => entry.__paragonIndex), [0, 1, 2]);
});

test("il collapse automatico espande solo il gruppo attivo e rimuove chiavi obsolete", () => {
  const entries = [
    actor("k1", "(1) Kobold"),
    actor("k2", "(2) Kobold"),
    actor("s1", "(1) Stirge", 8),
    actor("s2", "(2) Stirge", 8),
  ];
  const result = __autoCollapseSnapshot(entries, {
    order: entries.map((entry) => entry.id),
    current: 1,
    collapsed: { obsolete: true },
  });

  assert.equal(result.changed, true);
  assert.equal(result.collapsed[__groupKey(entries[0])], false);
  assert.equal(result.collapsed[__groupKey(entries[2])], true);
  assert.equal("obsolete" in result.collapsed, false);
});

test("la lista compatta emette una sola lead card per un gruppo collassato", () => {
  const entries = [actor("k1", "(1) Kobold"), actor("k2", "(2) Kobold"), actor("pc", "Hero", 9, "pc")];
  const key = __groupKey(entries[0]);
  const output = compactEntriesForRender(entries, { collapsed: { [key]: true } });

  assert.deepEqual(output.map((entry) => entry.id), ["k1", "pc"]);
  assert.equal(output[0].__groupCollapsed, true);
  assert.equal(output[0].__groupBase, "Kobold");
  assert.equal(output[0].__groupCount, 2);
  assert.deepEqual(output[0].__groupMembers.map((entry) => entry.id), ["k1", "k2"]);
});

test("ordina per iniziativa preservando ordine manuale, Epic e Tana", () => {
  const entries = [
    actor("low", "Low", 9),
    actor("__LAIR__", "Tana", 20),
    actor("normal", "Normal", 20),
    actor("epic", "Epic", 20, "enemy", { isEpic: true }),
    actor("tie-b", "Tie B", 15),
    actor("tie-a", "Tie A", 15),
  ];
  const sorted = sortByInitiative(entries, { order: ["tie-a", "tie-b"] });
  assert.deepEqual(sorted.map((entry) => entry.id), [
    "epic", "normal", "__LAIR__", "tie-a", "tie-b", "low",
  ]);
});

test("sanitizza ordine e indice preservando l'attore attivo", () => {
  const byId = new Map([["a", actor("a", "A")], ["b", actor("b", "B")]]);
  const state = sanitizeState({
    order: ["missing", "a", "a", "b"],
    current: 3,
    round: 0,
    seededGroups: { x: 1 },
    collapsed: { y: true },
    paragonInits: { a: [10] },
    ui: { dock: true },
  }, byId);

  assert.deepEqual(state.order, ["a", "b"]);
  assert.equal(state.current, 1);
  assert.equal(state.round, 1);
  assert.deepEqual(state.ui, { dock: true });
});

test("riordina un singolo pareggio mantenendo fisso l'attore attivo", () => {
  const entries = [actor("a", "A"), actor("b", "B"), actor("c", "C"), actor("d", "D", 8)];
  const result = reorderWithinSameInitiativeState(
    { order: ["a", "b", "c", "d"], current: 1 },
    entries,
    "c",
    "a",
    true,
  );
  assert.deepEqual(result.order, ["c", "a", "b", "d"]);
  assert.equal(result.current, 2);
  assert.equal(reorderWithinSameInitiativeState(
    { order: ["a", "b", "c", "d"], current: 0 }, entries, "a", "d", true,
  ), null);
});

test("riordina un gruppo come blocco preservandone l'ordine relativo", () => {
  const entries = [actor("a", "A"), actor("b", "B"), actor("c", "C"), actor("d", "D")];
  const result = reorderBlockWithinSameInitiativeState(
    { order: ["a", "b", "c", "d"], current: 2 },
    entries,
    ["b", "c"],
    "d",
    false,
  );
  assert.deepEqual(result.order, ["a", "d", "b", "c"]);
  assert.equal(result.current, 3);
});

test("le entry Epic a iniziativa 20 restano appuntate", () => {
  const entries = [
    actor("epic", "Epic", 20, "enemy", { isEpic: true }),
    actor("a", "A", 20),
    actor("b", "B", 20),
  ];
  const state = { order: ["epic", "a", "b"], current: 1 };
  assert.equal(reorderWithinSameInitiativeState(state, entries, "epic", "b", false), null);
  assert.equal(reorderBlockWithinSameInitiativeState(state, entries, ["epic", "a"], "b", false), null);
  assert.deepEqual(
    reorderWithinSameInitiativeState(state, entries, "b", "epic", true).order,
    ["epic", "b", "a"],
  );
});
