import test from "node:test";
import assert from "node:assert/strict";

import {
  INITIATIVE_EPIC_ACTION_PREFIX,
  INITIATIVE_LAIR_ID,
  isEpicActionId,
  isLairId,
  isParagonVirtualId,
  selectionIdsForEntry,
  splitParagonId,
} from "../src/initiativeSelectionProjectionCore.js";

test("gli ID reali, Lair, Epic e Paragon conservano la classificazione storica", () => {
  assert.equal(INITIATIVE_LAIR_ID, "__LAIR__");
  assert.equal(INITIATIVE_EPIC_ACTION_PREFIX, "__EPIC__");
  assert.equal(isLairId("__LAIR__"), true);
  assert.equal(isLairId("token-1"), false);
  assert.equal(isEpicActionId("__EPIC__::boss::after::hero"), true);
  assert.equal(isEpicActionId("boss::__EPIC__"), false);
  assert.equal(isParagonVirtualId("boss::p2"), true);
  assert.equal(isParagonVirtualId("boss"), false);
});

test("splitParagonId mantiene base, indice e fallback permissivi correnti", () => {
  assert.deepEqual(splitParagonId("boss::p2"), { baseId: "boss", idx: 2 });
  assert.deepEqual(splitParagonId("boss::p-4"), { baseId: "boss", idx: 0 });
  assert.deepEqual(splitParagonId("boss::pnot-a-number"), { baseId: "boss", idx: 0 });
  assert.deepEqual(splitParagonId("token-1"), { baseId: "token-1", idx: 0 });
  assert.deepEqual(splitParagonId(undefined), { baseId: undefined, idx: 0 });
});

test("la selezione di gruppo deduplica i token reali e scarta le entry virtuali", () => {
  const entry = {
    id: "lead::p1",
    __groupMembers: [
      { id: "lead::p1" },
      { id: "lead::p2" },
      { id: "ally" },
      { id: "ally" },
      { id: "__LAIR__" },
      { id: "__EPIC__::boss::after::ally" },
      { id: "" },
    ],
  };

  assert.deepEqual(selectionIdsForEntry(entry), ["lead", "ally"]);
  assert.deepEqual(selectionIdsForEntry({ id: "solo::p3" }), ["solo"]);
  assert.deepEqual(selectionIdsForEntry(null), []);
});
