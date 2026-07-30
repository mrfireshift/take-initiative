import test from "node:test";
import assert from "node:assert/strict";

import {
  confirmedSpellAreaTargetIds,
  getQuickHpInstantAreaRule,
  getQuickHpPlaceableAreaRule,
  quickHpAreaPlacementPresentation,
  quickHpSpellUsesSaveOutcomes,
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

test("Fame di Hadar richiede esiti solo quando si risolve il trigger finale", () => {
  assert.equal(quickHpSpellUsesSaveOutcomes({
    spellId: "phb2014-fame-di-hadar",
    castSaveSpellIds: new Set(["fireball"]),
  }), false);
  assert.equal(quickHpSpellUsesSaveOutcomes({
    spellId: "phb2014-fame-di-hadar",
    castSaveSpellIds: new Set(["fireball"]),
    activeZoneTrigger: {
      spellId: "phb2014-fame-di-hadar",
      resolution: "manual-save",
    },
  }), true);
  assert.equal(quickHpSpellUsesSaveOutcomes({
    spellId: "phb2014-fame-di-hadar",
    castSaveSpellIds: new Set(["fireball"]),
    activeZoneTrigger: {
      spellId: "phb2014-fame-di-hadar",
      resolution: "informational",
    },
  }), false);
});

test("le zone ritardate non mostrano esiti al lancio, quelle immediate si", () => {
  const legacySaveSet = new Set([
    "web",
    "xanathar-maelstrom",
    "sleet-storm",
    "stinking-cloud",
    "entangle",
    "grease",
    "xanathar-sfera-della-tempesta",
  ]);

  for (const spellId of [
    "black-tentacles",
    "web",
    "xanathar-maelstrom",
    "sleet-storm",
    "stinking-cloud",
    "phb2014-nube-di-pugnali",
    "control-water",
    "xanathar-collera-della-natura",
  ]) {
    assert.equal(quickHpSpellUsesSaveOutcomes({
      spellId,
      castSaveSpellIds: legacySaveSet,
    }), false, spellId);
  }
  for (const spellId of [
    "entangle",
    "grease",
    "xanathar-sfera-della-tempesta",
  ]) {
    assert.equal(quickHpSpellUsesSaveOutcomes({
      spellId,
      castSaveSpellIds: legacySaveSet,
    }), true, spellId);
  }
  assert.equal(quickHpSpellUsesSaveOutcomes({
    spellId: "wall-of-fire",
    castSaveSpellIds: legacySaveSet,
    activeZoneTrigger: {
      spellId: "wall-of-fire",
      resolution: "informational",
    },
  }), false);
  assert.equal(quickHpSpellUsesSaveOutcomes({
    spellId: "spirit-guardians",
    castSaveSpellIds: new Set(["spirit-guardians"]),
  }), false);
});
