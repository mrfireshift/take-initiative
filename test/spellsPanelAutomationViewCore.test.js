import test from "node:test";
import assert from "node:assert/strict";

import { getSpellDefinition } from "../src/spells-srd.js";
import { buildSpellAutomationViewModel } from "../src/spellsPanelAutomationViewCore.js";

function viewFor(spellId, options = {}) {
  return buildSpellAutomationViewModel({
    spell: getSpellDefinition(spellId),
    castContext: options.castContext || {},
    previousChoice: options.previousChoice || "",
  });
}

test("una spell ad area descrive condizioni ed esiti sui bersagli selezionati", () => {
  const view = viewFor("entangle");

  assert.deepEqual(view.conditionLabels, ["Trattenuto"]);
  assert.equal(view.targetLabel, "token selezionati con esito configurato");
  assert.equal(view.hasAutomatedConditions, true);
  assert.match(view.text, /Trattenuto/);
  assert.match(view.text, /TS fallito|esito configurato/);
});

test("le varianti conservano la scelta precedente soltanto se ancora valida", () => {
  const preserved = viewFor("xanathar-pirotecnica", {
    previousChoice: "smoke",
  });
  const reset = viewFor("xanathar-pirotecnica", {
    previousChoice: "unknown",
  });

  assert.ok(preserved.choices.length > 1);
  assert.equal(preserved.selectedChoice, "smoke");
  assert.equal(reset.selectedChoice, preserved.choices[0].value);
  assert.equal(preserved.showChoice, true);
});

test("una variante di solo effetto disabilita le condizioni ma conserva la pill", () => {
  const view = viewFor("xanathar-pirotecnica", {
    previousChoice: "smoke",
  });

  assert.deepEqual(view.conditionLabels, []);
  assert.ok(view.effectLabels.length > 0);
  assert.equal(view.hasAutomatedConditions, false);
  assert.match(view.text, /^Tracciamento con effetti\./);
});

test("la fase di preparazione usa il caster senza anticipare l'esito", () => {
  const view = viewFor("phb2014-punizione-tonante", {
    castContext: { slotLevel: 1 },
  });

  assert.equal(view.phasePlan.phase, "prepare");
  assert.equal(view.targetLabel, "caster");
  assert.equal(view.hasAutomatedConditions, false);
});

test("durata manuale e assenza di automazioni restano esplicite", () => {
  const view = viewFor("arcane-lock");

  assert.equal(view.hasAutomatedConditions, false);
  assert.match(view.text, /Solo tracciamento|Tracciamento con effetti/);
  assert.match(view.text, /Imposta i round manualmente/);
});

test("un input senza spell non produce un modello parziale", () => {
  assert.equal(buildSpellAutomationViewModel(), null);
});
