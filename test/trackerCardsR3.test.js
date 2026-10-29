import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { inlineHPInputWidth } from "../src/initiativeEditors.js";
import { deriveCompactCardPresentation } from "../src/initiativeCardCompact.js";

// Lot L20 of the bugfix pass, polish R3 "Card del tracker" (docs/PIANO_BUGFIX_POLISHING.md, section 3).
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("L20: i campi dei PF in linea si allargano per «-120», restano di 22 px per i valori corti", () => {
  assert.equal(inlineHPInputWidth("12"), "22px");
  assert.equal(inlineHPInputWidth("-12"), "22px");
  assert.equal(inlineHPInputWidth("-120"), "max(22px, 4.5ch)");
  assert.equal(inlineHPInputWidth("1200"), "max(22px, 4.5ch)");
  const editors = read("../src/initiativeEditors.js");
  assert.match(editors, /input\.value = normalizeSignedIntegerInput\(input\.value\);\n\s+input\.style\.width = inlineHPInputWidth\(input\.value\);/);
  assert.match(editors, /for \(const input of \[hpInput, hpMaxInput\]\) input\.style\.width = inlineHPInputWidth\(input\.value\);/);
  assert.equal(editors.split("hpMaxInput.style.width = inlineHPInputWidth(hpMaxInput.value);").length - 1, 2, "the linked maximum too");
});

test("L20: nel compatto un gruppo collassato non mostra i PF del suo primo membro", () => {
  const members = [{ id: "g1", hp: 3, hpMax: 7 }, { id: "g2", hp: 7, hpMax: 7 }];
  const group = { id: "g1", name: "Goblin", hp: 3, hpMax: 7, attitude: "enemy", __groupCollapsed: true, __groupCount: 2, __groupMembers: members };
  const collapsed = deriveCompactCardPresentation(group, "", { isGM: true });
  assert.equal(collapsed.showHP, false);
  assert.equal(collapsed.hasHP, false);
  assert.equal(collapsed.knockedOut, false);
  const single = deriveCompactCardPresentation({ ...group, __groupCollapsed: false }, "", { isGM: true });
  assert.equal(single.showHP, true, "a card of its own keeps its HP");
});

test("L20: una condizione dal nome lungo si accorcia con i puntini e tiene la × nella pill", () => {
  const conditions = read("../src/conditions.js");
  assert.match(conditions, /chipLabel\.textContent = group\.label;\n[\s\S]{0,120}Object\.assign\(chipLabel\.style, \{\n\s+minWidth: "0",\n\s+flex: "0 1 auto",\n\s+overflow: "hidden",\n\s+textOverflow: "ellipsis",/);
  assert.match(conditions, /whiteSpace: "nowrap",\n\s+maxWidth: "100%",\n\s+minWidth: "0",\n\s+boxSizing: "border-box",\n\s+overflow: "hidden",/);
  assert.match(conditions, /lineHeight: compact \? "10px" : "12px",\n\s+flex: "0 0 auto",\n\s+cursor: "pointer",/, "the × never shrinks");
  assert.match(read("../src/initiativeCardClassicBuilder.js"), /mountChipsWithOverflow\(condDock, fragAll, \{ compact: true, limit: 3, memoryKey: e\.id \}\);/);
});
