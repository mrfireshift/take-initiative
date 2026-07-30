import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/quick-hp-modal.js", import.meta.url),
  "utf8",
);
const markup = readFileSync(
  new URL("../quick-hp-modal.html", import.meta.url),
  "utf8",
);

test("la conferma della sagoma blocca solo la selezione dei bersagli", () => {
  assert.match(source, /targetSelectionLocked = true;/);
  assert.match(source, /checkbox\.disabled = disabled \|\| busy \|\| selectionLocked;/);
  assert.match(source, /if \(disabled \|\| busy \|\| selectionLocked\) return;/);
  assert.match(
    source,
    /renderOutcomeButtons\(item, disabled \|\| \(selectionLocked && !selected\)\)/,
  );
});

test("il lock è visibile, reversibile e ignora la selezione esterna", () => {
  assert.match(markup, /id="targetLock" hidden/);
  assert.match(markup, /id="unlockTargets"/);
  assert.match(source, /if \(targetSelectionLocked\) return;/);
  assert.match(
    source,
    /unlockTargetsButton\.addEventListener\("click",[\s\S]*targetSelectionLocked = false;/,
  );
});

test("zone vuote e aure conservano il lifecycle con reminder governati dal feature flag", () => {
  assert.match(
    source,
    /if \(!candidateIds\.length && !staticZonePlacement && !mobileAuraPlacement\) return;/,
  );
  assert.match(
    source,
    /allowEmptyTargets: !!staticZonePlacement \|\| mobileAuraPlacement/,
  );
  assert.match(source, /castContext: mobileAuraPlacement/);
  assert.match(source, /SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED/);
});
