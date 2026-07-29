import test from "node:test";
import assert from "node:assert/strict";

import {
  spellAreaStyle,
  spellAreaTheme,
} from "../src/spellAreaStyleCore.js";

test("le aree usano palette coerenti col flavor della spell", () => {
  assert.equal(spellAreaTheme("wall-of-fire"), "fire");
  assert.equal(spellAreaTheme("sleet-storm"), "cold");
  assert.equal(spellAreaTheme("darkness"), "darkness");
  assert.equal(spellAreaTheme("xanathar-maelstrom"), "water");
  assert.equal(spellAreaTheme("silence"), "silence");
});

test("la palette tematica conserva opacità e spessore scelti dall'utente", () => {
  assert.deepEqual(spellAreaStyle("cloudkill", {
    fillColor: "#ffffff",
    strokeColor: "#ffffff",
    fillOpacity: 0.27,
    strokeWidth: 1.7,
  }), {
    fillColor: "#65a30d",
    strokeColor: "#bef264",
    fillOpacity: 0.27,
    strokeWidth: 1.7,
  });
});
