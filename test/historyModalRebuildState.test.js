import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { transformSync } from "esbuild";

// Lot L14 of the bugfix pass (HI-03): every item change rebuilds the Registro. The note being typed was emptied, the
// focus jumped to the search box, and the «Svuota» and «Elimina registro» confirmations closed.
const source = readFileSync(new URL("../src/history-modal.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const slice = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

test("L14: il focus si ripristina solo sul controllo che lo aveva, mai sul Cerca toccato prima", () => {
  const { code } = transformSync(slice("function rememberCombatLogFocus(", "function restoreCombatLogUiState("), { loader: "ts" });
  class HTMLElement { constructor(control) { this.dataset = control ? { combatLogControl: control } : {}; } }
  class HTMLInputElement extends HTMLElement { constructor(control) { super(control); this.selectionStart = 2; this.selectionEnd = 4; } }
  const state = { focusControl: "", selectionStart: null, selectionEnd: null };
  const remember = runInNewContext(`${code}\nrememberCombatLogFocus`, { combatLogUiState: state, HTMLElement, HTMLInputElement, document: {} });
  remember(new HTMLInputElement("search"));
  assert.deepEqual([state.focusControl, state.selectionStart, state.selectionEnd], ["search", 2, 4]);
  remember(new HTMLElement(""));
  assert.equal(state.focusControl, "", "focus moved to something that is not a control: nothing to restore");
  remember(new HTMLInputElement("note"));
  assert.equal(state.focusControl, "note");
});

test("L14: la nota in scrittura e le conferme di Svuota ed Elimina registro sopravvivono alla ricostruzione", () => {
  const note = slice('const noteForm = document.createElement("form");', "const status = document.createElement(\"div\");");
  assert.match(note, /note\.dataset\.combatLogControl = "note";/);
  assert.match(note, /note\.value = combatLogUiState\.noteDraft;/);
  assert.match(note, /combatLogUiState\.noteDraft = note\.value;/);
  assert.match(note, /if \(created\.length\) combatLogUiState\.noteDraft = "";/);
  for (const [kind, field] of [["Clear", "confirmingClearSessionId"], ["Delete", "confirmingDeleteSessionId"]]) {
    assert.match(source, new RegExp(`combatLogUiState\\.${field} = open \\? String\\(session\\?\\.id \\|\\| ""\\) : "";`));
    assert.match(source, new RegExp(`if \\(session\\?\\.id && combatLogUiState\\.${field} === String\\(session\\.id\\) && !\\w+Log\\.disabled\\) show${kind}Confirmation\\(true\\);`));
  }
});
