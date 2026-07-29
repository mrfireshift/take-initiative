import test from "node:test";
import assert from "node:assert/strict";

import {
  confirmedSpellAreaTargetIds,
  getQuickHpInstantAreaRule,
  getQuickHpPlaceableAreaRule,
  quickHpAreaPlacementPresentation,
} from "../src/quickHpAreaWorkflowCore.js";

test("espone il posizionamento per le sagome supportate", () => {
  assert.equal(getQuickHpInstantAreaRule("fireball")?.id, "fireball:cast");
  assert.equal(getQuickHpInstantAreaRule("web"), null);
  assert.equal(getQuickHpPlaceableAreaRule("web")?.id, "web:cast");
  assert.equal(getQuickHpPlaceableAreaRule("entangle")?.id, "entangle:cast");
  assert.equal(getQuickHpPlaceableAreaRule("moonbeam")?.id, "moonbeam:cast");
  assert.equal(
    getQuickHpPlaceableAreaRule("xanathar-investitura-del-ghiaccio")?.kind,
    "emission",
  );
  assert.equal(
    getQuickHpPlaceableAreaRule("spirit-guardians")?.kind,
    "aura",
  );
  assert.equal(quickHpAreaPlacementPresentation({
    spellId: "burning-hands",
    casterId: "",
  }).disabled, true);
  assert.deepEqual(quickHpAreaPlacementPresentation({
    spellId: "unknown",
    casterId: "caster",
  }), {
    rule: null,
    hidden: false,
    disabled: true,
    text: "Posiziona area",
    title: "Seleziona un incantesimo con area posizionabile",
  });
});

test("normalizza i bersagli confermati contro quelli disponibili", () => {
  assert.deepEqual(confirmedSpellAreaTargetIds({
    status: "confirmed",
    preview: { targetIds: ["a", "a", "missing", "b"] },
  }, ["a", "b", "c"]), ["a", "b"]);
  assert.deepEqual(confirmedSpellAreaTargetIds({
    status: "cancelled",
    preview: { targetIds: ["a"] },
  }, ["a"]), []);
});
