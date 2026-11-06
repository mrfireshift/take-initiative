// Found along the way on 6/11: the panel's list of the spells active on the field said an action's cost as the code says
// it ("bonus-action", "gm") and repeated its text. Its cost now in words, once, and nothing for what costs nothing.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { actionEconomyLabel } from "../src/spellUnifiedPanelViewCore.js";
import { SPELL_ACTIVE_RESOLUTION_ACTIONS } from "../src/spellActiveResolutionRules.js";

test("an action's cost in the panel's words, and none for a GM command or an action that declares none", () => {
  assert.equal(actionEconomyLabel("action"), "Azione");
  assert.equal(actionEconomyLabel("bonus-action"), "Azione bonus");
  assert.equal(actionEconomyLabel("reaction"), "Reazione");
  assert.equal(actionEconomyLabel("gm"), "");
  assert.equal(actionEconomyLabel("Comando GM"), "");
  assert.equal(actionEconomyLabel(""), "");
  assert.equal(actionEconomyLabel(undefined), "");
});

test("no action of the popups has a cost the panel would say in English", () => {
  for (const action of Object.values(SPELL_ACTIVE_RESOLUTION_ACTIONS).flat()) {
    assert.doesNotMatch(actionEconomyLabel(action.economy), /-|^gm$|action/u, action.id);
  }
});

test("the line under an action: the cost once, the text, and a note only when it says something more", () => {
  const view = readFileSync(new URL("../src/spellUnifiedPanelEffectsView.js", import.meta.url), "utf8");
  assert.match(view, /costSaid \? "" : action\.economyLabel,/);
  assert.match(view, /note && note !== action\.detail && note !== \(action\.buttonLabel \|\| action\.label\) \? note : ""/);
  assert.doesNotMatch(view, /action\.economyLabel \|\| action\.economy/, "never the code's word");
  const core = readFileSync(new URL("../src/spellUnifiedPanelViewCore.js", import.meta.url), "utf8");
  assert.equal((core.match(/economyLabel: actionEconomyLabel\(/g) || []).length, 2);
});
